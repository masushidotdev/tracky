import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { isMonthlyReportEmailEligible } from './analyst/emailEligibility';
import { resend } from './analyst/emails';
import { isAccountDeletionStarted } from './lib/accountDeletionGuard';
import { renderNotificationText } from './lib/notificationMessages';
import type { Doc, Id } from './_generated/dataModel';

export const DELIVERABLE_TYPES = ['billReminder', 'upcomingPayment', 'lowProjectedBalance'] as const;

type DeliveryChannel = 'email' | 'telegram';
type DeliveryContext = {
  notification: Doc<'notifications'>;
  userSettings: Doc<'userSettings'> | null;
  userProfile: Doc<'userProfiles'> | null;
  telegramLink: Doc<'telegramLinks'> | null;
};

const deliveryRefs = {
  context: makeFunctionReference<'query', { notificationId: Id<'notifications'> }, DeliveryContext | null>(
    'notificationDelivery:getDeliveryContext',
  ),
  queueEmail: makeFunctionReference<
    'mutation',
    { notificationId: Id<'notifications'>; subject: string; text: string },
    { status: 'queued' | 'alreadyDelivered' | 'skipped'; emailId: string | null }
  >('notificationDelivery:queueNotificationEmail'),
  markDelivered: makeFunctionReference<
    'mutation',
    { notificationId: Id<'notifications'>; channel: DeliveryChannel },
    { updated: boolean; deliveredAtMs: number | null }
  >('notificationDelivery:markDelivered'),
};

function isDeliverableType(type: Doc<'notifications'>['type']) {
  return DELIVERABLE_TYPES.some((deliverableType) => deliverableType === type);
}

function notificationLocale(locale: string | undefined): 'en' | 'it' {
  return locale?.toLowerCase().startsWith('it') ? 'it' : 'en';
}

export const getDeliveryContext = internalQuery({
  args: { notificationId: v.id('notifications') },
  handler: async (ctx, args): Promise<DeliveryContext | null> => {
    const notification = await ctx.db.get('notifications', args.notificationId);
    if (!notification) {
      return null;
    }

    const [userSettings, userProfile, telegramLink] = await Promise.all([
      ctx.db
        .query('userSettings')
        .withIndex('by_userId', (q) => q.eq('userId', notification.userId))
        .unique(),
      ctx.db
        .query('userProfiles')
        .withIndex('by_authUserId', (q) => q.eq('authUserId', notification.userId))
        .unique(),
      ctx.db
        .query('telegramLinks')
        .withIndex('by_userId', (q) => q.eq('userId', notification.userId))
        .unique(),
    ]);

    return {
      notification,
      userSettings,
      userProfile,
      telegramLink: telegramLink?.verifiedAtMs ? telegramLink : null,
    };
  },
});

export const queueNotificationEmail = internalMutation({
  args: {
    notificationId: v.id('notifications'),
    subject: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get('notifications', args.notificationId);
    if (!notification) {
      return { status: 'skipped' as const, emailId: null };
    }
    if (await isAccountDeletionStarted(ctx, notification.userId)) {
      return { status: 'skipped' as const, emailId: null };
    }
    if (notification.emailDeliveredAtMs !== undefined) {
      return { status: 'alreadyDelivered' as const, emailId: null };
    }

    const settings = await ctx.db
      .query('userSettings')
      .withIndex('by_userId', (q) => q.eq('userId', notification.userId))
      .unique();
    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_authUserId', (q) => q.eq('authUserId', notification.userId))
      .unique();
    const from = process.env.RESEND_FROM_EMAIL?.trim();
    if (
      settings?.notifications?.emailEnabled !== true ||
      !isMonthlyReportEmailEligible(profile) ||
      !from ||
      !process.env.RESEND_API_KEY
    ) {
      return { status: 'skipped' as const, emailId: null };
    }

    const emailId = await resend.sendEmail(ctx, {
      from,
      to: profile.email,
      subject: args.subject,
      text: args.text,
    });
    return { status: 'queued' as const, emailId };
  },
});

export const maySendNotificationTelegram = internalMutation({
  args: { notificationId: v.id('notifications'), userId: v.string(), chatId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get('notifications', args.notificationId);
    if (!notification || notification.userId !== args.userId ||
      notification.telegramDeliveredAtMs !== undefined || !isDeliverableType(notification.type) ||
      await isAccountDeletionStarted(ctx, args.userId)) return false;
    const settings = await ctx.db.query('userSettings')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId)).unique();
    if (settings?.notifications?.telegramEnabled !== true) return false;
    const link = await ctx.db.query('telegramLinks')
      .withIndex('by_chatId', (q) => q.eq('chatId', args.chatId)).unique();
    return link?.userId === args.userId && !!link.verifiedAtMs;
  },
});

export const markDelivered = internalMutation({
  args: {
    notificationId: v.id('notifications'),
    channel: v.union(v.literal('email'), v.literal('telegram')),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get('notifications', args.notificationId);
    if (!notification) {
      return { updated: false, deliveredAtMs: null };
    }

    const deliveredAtMs =
      args.channel === 'email' ? notification.emailDeliveredAtMs : notification.telegramDeliveredAtMs;
    if (deliveredAtMs !== undefined) {
      return { updated: false, deliveredAtMs };
    }

    const now = Date.now();
    if (args.channel === 'email') {
      await ctx.db.patch('notifications', notification._id, { emailDeliveredAtMs: now });
    } else {
      await ctx.db.patch('notifications', notification._id, { telegramDeliveredAtMs: now });
    }
    return { updated: true, deliveredAtMs: now };
  },
});

export const deliverNotifications = internalAction({
  args: { notificationIds: v.array(v.id('notifications')) },
  handler: async (ctx, args): Promise<null> => {
    for (const notificationId of args.notificationIds) {
      const context = await ctx.runQuery(deliveryRefs.context, { notificationId });
      if (!context || !isDeliverableType(context.notification.type)) {
        continue;
      }

      const preferences = context.userSettings?.notifications;
      if (!preferences?.emailEnabled && !preferences?.telegramEnabled) {
        continue;
      }

      const text = renderNotificationText(
        context.notification.titleKey,
        context.notification.bodyKey,
        context.notification.params,
        notificationLocale(context.userProfile?.locale),
      );

      if (
        preferences.emailEnabled &&
        context.notification.emailDeliveredAtMs === undefined &&
        isMonthlyReportEmailEligible(context.userProfile)
      ) {
        try {
          const result = await ctx.runMutation(deliveryRefs.queueEmail, {
            notificationId,
            subject: text.title,
            text: `${text.title}\n\n${text.body}`,
          });
          if (result.status === 'queued') {
            await ctx.runMutation(deliveryRefs.markDelivered, { notificationId, channel: 'email' });
          }
        } catch {
          // The notification remains undelivered so a later retry can send it.
        }
      }

      if (
        preferences.telegramEnabled &&
        context.notification.telegramDeliveredAtMs === undefined &&
        context.telegramLink
      ) {
        try {
          await ctx.runAction(internal.analyst.telegramActions.sendNotificationTelegram, {
            notificationId,
            userId: context.notification.userId,
            chatId: context.telegramLink.chatId,
            text: `${text.title}\n${text.body}`,
          });
          await ctx.runMutation(deliveryRefs.markDelivered, { notificationId, channel: 'telegram' });
        } catch {
          // The notification remains undelivered so a later retry can send it.
        }
      }
    }

    return null;
  },
});
