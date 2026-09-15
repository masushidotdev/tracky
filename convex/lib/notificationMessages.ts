type NotificationLocale = 'en' | 'it';
type NotificationParams = Record<string, string | number>;

const templates: Record<NotificationLocale, Record<string, string>> = {
  en: {
    'notifications.billReminder.title': 'Bill due soon',
    'notifications.billReminder.body': '{name} of {amount} {currency} is due on {date}.',
    'notifications.payment.subscription.title': 'Subscription due soon',
    'notifications.payment.subscription.body': '{name} is due on {date}.',
    'notifications.payment.installment.title': 'Installment due soon',
    'notifications.payment.installment.body': '{name} for {facility} is due on {date}.',
    'notifications.cashflow.negative.title': 'Projected balance below zero',
    'notifications.cashflow.negative.body': '{account} is projected below zero on {date}.',
  },
  it: {
    'notifications.billReminder.title': 'Bolletta in scadenza',
    'notifications.billReminder.body': '{name} di {amount} {currency} scade il {date}.',
    'notifications.payment.subscription.title': 'Sottoscrizione in scadenza',
    'notifications.payment.subscription.body': '{name} scade il {date}.',
    'notifications.payment.installment.title': 'Rata in scadenza',
    'notifications.payment.installment.body': '{name} per {facility} scade il {date}.',
    'notifications.cashflow.negative.title': 'Saldo proiettato sotto zero',
    'notifications.cashflow.negative.body': '{account} è previsto sotto zero il {date}.',
  },
};

function interpolate(template: string, params: NotificationParams) {
  return template.replace(/\{([^{}]+)\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match;
  });
}

export function renderNotificationText(
  titleKey: string,
  bodyKey: string,
  params: NotificationParams,
  locale: NotificationLocale,
) {
  return {
    title: interpolate(templates[locale][titleKey] ?? titleKey, params),
    body: interpolate(templates[locale][bodyKey] ?? bodyKey, params),
  };
}
