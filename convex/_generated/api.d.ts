/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analyst_agent from "../analyst/agent.js";
import type * as analyst_approvalBatch from "../analyst/approvalBatch.js";
import type * as analyst_chat from "../analyst/chat.js";
import type * as analyst_emailEligibility from "../analyst/emailEligibility.js";
import type * as analyst_emails from "../analyst/emails.js";
import type * as analyst_format from "../analyst/format.js";
import type * as analyst_functionRefs from "../analyst/functionRefs.js";
import type * as analyst_memoryActions from "../analyst/memoryActions.js";
import type * as analyst_memoryCore from "../analyst/memoryCore.js";
import type * as analyst_memoryStore from "../analyst/memoryStore.js";
import type * as analyst_models from "../analyst/models.js";
import type * as analyst_moneyBoxOptimizerCore from "../analyst/moneyBoxOptimizerCore.js";
import type * as analyst_proactive_anomalyCore from "../analyst/proactive/anomalyCore.js";
import type * as analyst_proactive_debtPayoffCore from "../analyst/proactive/debtPayoffCore.js";
import type * as analyst_proactive_healthScoreCore from "../analyst/proactive/healthScoreCore.js";
import type * as analyst_proactive_jobs from "../analyst/proactive/jobs.js";
import type * as analyst_proactive_mutations from "../analyst/proactive/mutations.js";
import type * as analyst_proactive_queries from "../analyst/proactive/queries.js";
import type * as analyst_proactive_reports from "../analyst/proactive/reports.js";
import type * as analyst_proactive_subscriptionReviewCore from "../analyst/proactive/subscriptionReviewCore.js";
import type * as analyst_prompts_budgeting from "../analyst/prompts/budgeting.js";
import type * as analyst_prompts_core from "../analyst/prompts/core.js";
import type * as analyst_prompts_debt from "../analyst/prompts/debt.js";
import type * as analyst_prompts_debtPayoff from "../analyst/prompts/debtPayoff.js";
import type * as analyst_prompts_fire from "../analyst/prompts/fire.js";
import type * as analyst_prompts_index from "../analyst/prompts/index.js";
import type * as analyst_prompts_monthlyReport from "../analyst/prompts/monthlyReport.js";
import type * as analyst_prompts_purchase from "../analyst/prompts/purchase.js";
import type * as analyst_prompts_research from "../analyst/prompts/research.js";
import type * as analyst_prompts_spendingReview from "../analyst/prompts/spendingReview.js";
import type * as analyst_prompts_subscriptionReview from "../analyst/prompts/subscriptionReview.js";
import type * as analyst_prompts_types from "../analyst/prompts/types.js";
import type * as analyst_prompts_whatIf from "../analyst/prompts/whatIf.js";
import type * as analyst_queries from "../analyst/queries.js";
import type * as analyst_rateLimits from "../analyst/rateLimits.js";
import type * as analyst_stream from "../analyst/stream.js";
import type * as analyst_subscriptionMath from "../analyst/subscriptionMath.js";
import type * as analyst_telegram from "../analyst/telegram.js";
import type * as analyst_telegramActions from "../analyst/telegramActions.js";
import type * as analyst_telegramCore from "../analyst/telegramCore.js";
import type * as analyst_telegramRefs from "../analyst/telegramRefs.js";
import type * as analyst_telemetry from "../analyst/telemetry.js";
import type * as analyst_titles from "../analyst/titles.js";
import type * as analyst_tools_debtPayoff from "../analyst/tools/debtPayoff.js";
import type * as analyst_tools_forecast from "../analyst/tools/forecast.js";
import type * as analyst_tools_index from "../analyst/tools/index.js";
import type * as analyst_tools_longTermProjection from "../analyst/tools/longTermProjection.js";
import type * as analyst_tools_memory from "../analyst/tools/memory.js";
import type * as analyst_tools_moneyBoxOptimizer from "../analyst/tools/moneyBoxOptimizer.js";
import type * as analyst_tools_present from "../analyst/tools/present.js";
import type * as analyst_tools_read from "../analyst/tools/read.js";
import type * as analyst_tools_search from "../analyst/tools/search.js";
import type * as analyst_tools_simulate from "../analyst/tools/simulate.js";
import type * as analyst_tools_write from "../analyst/tools/write.js";
import type * as analyst_turnLocks from "../analyst/turnLocks.js";
import type * as analyst_whatIfCore from "../analyst/whatIfCore.js";
import type * as analyst_writes from "../analyst/writes.js";
import type * as auth from "../auth.js";
import type * as authProfiles from "../authProfiles.js";
import type * as banking_accounts from "../banking/accounts.js";
import type * as banking_balances from "../banking/balances.js";
import type * as banking_cardStatementSettlement from "../banking/cardStatementSettlement.js";
import type * as banking_categories from "../banking/categories.js";
import type * as banking_categoryRuleCore from "../banking/categoryRuleCore.js";
import type * as banking_categoryRules from "../banking/categoryRules.js";
import type * as banking_categoryTaxonomy from "../banking/categoryTaxonomy.js";
import type * as banking_connectionHealth from "../banking/connectionHealth.js";
import type * as banking_credit from "../banking/credit.js";
import type * as banking_creditMath from "../banking/creditMath.js";
import type * as banking_creditValidation from "../banking/creditValidation.js";
import type * as banking_csvImport from "../banking/csvImport.js";
import type * as banking_dashboard from "../banking/dashboard.js";
import type * as banking_enableBanking from "../banking/enableBanking.js";
import type * as banking_enableBankingErrors from "../banking/enableBankingErrors.js";
import type * as banking_enableBankingTransactionMapping from "../banking/enableBankingTransactionMapping.js";
import type * as banking_loans from "../banking/loans.js";
import type * as banking_manualAccounts from "../banking/manualAccounts.js";
import type * as banking_manualTransactions from "../banking/manualTransactions.js";
import type * as banking_overdraft from "../banking/overdraft.js";
import type * as banking_payDown from "../banking/payDown.js";
import type * as banking_plan from "../banking/plan.js";
import type * as banking_planActivity from "../banking/planActivity.js";
import type * as banking_planCardSettlements from "../banking/planCardSettlements.js";
import type * as banking_planMath from "../banking/planMath.js";
import type * as banking_planRead from "../banking/planRead.js";
import type * as banking_planSnapshotInvalidation from "../banking/planSnapshotInvalidation.js";
import type * as banking_planSystemBuckets from "../banking/planSystemBuckets.js";
import type * as banking_planning from "../banking/planning.js";
import type * as banking_planningMath from "../banking/planningMath.js";
import type * as banking_planningReconciliation from "../banking/planningReconciliation.js";
import type * as banking_planningSuggestionFunctions from "../banking/planningSuggestionFunctions.js";
import type * as banking_planningSuggestions from "../banking/planningSuggestions.js";
import type * as banking_providerMutations from "../banking/providerMutations.js";
import type * as banking_providerQueries from "../banking/providerQueries.js";
import type * as banking_reports from "../banking/reports.js";
import type * as banking_reportsCore from "../banking/reportsCore.js";
import type * as banking_safeToSpend from "../banking/safeToSpend.js";
import type * as banking_safeToSpendCore from "../banking/safeToSpendCore.js";
import type * as banking_savedReports from "../banking/savedReports.js";
import type * as banking_scheduledTransactions from "../banking/scheduledTransactions.js";
import type * as banking_statementCycles from "../banking/statementCycles.js";
import type * as banking_subscriptionDetection from "../banking/subscriptionDetection.js";
import type * as banking_syncCadence from "../banking/syncCadence.js";
import type * as banking_syncWindow from "../banking/syncWindow.js";
import type * as banking_transactionMeta from "../banking/transactionMeta.js";
import type * as banking_transactions from "../banking/transactions.js";
import type * as banking_transferCandidates from "../banking/transferCandidates.js";
import type * as banking_transferCore from "../banking/transferCore.js";
import type * as banking_transferMutations from "../banking/transferMutations.js";
import type * as banking_transfers from "../banking/transfers.js";
import type * as crons from "../crons.js";
import type * as dataExport from "../dataExport.js";
import type * as entitlements from "../entitlements.js";
import type * as forecast_forecastCore from "../forecast/forecastCore.js";
import type * as forecast_liabilityMath from "../forecast/liabilityMath.js";
import type * as forecast_projection from "../forecast/projection.js";
import type * as forecast_projectionMath from "../forecast/projectionMath.js";
import type * as forecast_scenarios from "../forecast/scenarios.js";
import type * as forecast_seeds from "../forecast/seeds.js";
import type * as http from "../http.js";
import type * as lib_accountTypes from "../lib/accountTypes.js";
import type * as lib_entitlements from "../lib/entitlements.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_notificationMessages from "../lib/notificationMessages.js";
import type * as lib_validators from "../lib/validators.js";
import type * as migrations from "../migrations.js";
import type * as notificationDelivery from "../notificationDelivery.js";
import type * as notifications from "../notifications.js";
import type * as plannedTransactionsTestHelpers from "../plannedTransactionsTestHelpers.js";
import type * as subscriptions from "../subscriptions.js";
import type * as userSettings from "../userSettings.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "analyst/agent": typeof analyst_agent;
  "analyst/approvalBatch": typeof analyst_approvalBatch;
  "analyst/chat": typeof analyst_chat;
  "analyst/emailEligibility": typeof analyst_emailEligibility;
  "analyst/emails": typeof analyst_emails;
  "analyst/format": typeof analyst_format;
  "analyst/functionRefs": typeof analyst_functionRefs;
  "analyst/memoryActions": typeof analyst_memoryActions;
  "analyst/memoryCore": typeof analyst_memoryCore;
  "analyst/memoryStore": typeof analyst_memoryStore;
  "analyst/models": typeof analyst_models;
  "analyst/moneyBoxOptimizerCore": typeof analyst_moneyBoxOptimizerCore;
  "analyst/proactive/anomalyCore": typeof analyst_proactive_anomalyCore;
  "analyst/proactive/debtPayoffCore": typeof analyst_proactive_debtPayoffCore;
  "analyst/proactive/healthScoreCore": typeof analyst_proactive_healthScoreCore;
  "analyst/proactive/jobs": typeof analyst_proactive_jobs;
  "analyst/proactive/mutations": typeof analyst_proactive_mutations;
  "analyst/proactive/queries": typeof analyst_proactive_queries;
  "analyst/proactive/reports": typeof analyst_proactive_reports;
  "analyst/proactive/subscriptionReviewCore": typeof analyst_proactive_subscriptionReviewCore;
  "analyst/prompts/budgeting": typeof analyst_prompts_budgeting;
  "analyst/prompts/core": typeof analyst_prompts_core;
  "analyst/prompts/debt": typeof analyst_prompts_debt;
  "analyst/prompts/debtPayoff": typeof analyst_prompts_debtPayoff;
  "analyst/prompts/fire": typeof analyst_prompts_fire;
  "analyst/prompts/index": typeof analyst_prompts_index;
  "analyst/prompts/monthlyReport": typeof analyst_prompts_monthlyReport;
  "analyst/prompts/purchase": typeof analyst_prompts_purchase;
  "analyst/prompts/research": typeof analyst_prompts_research;
  "analyst/prompts/spendingReview": typeof analyst_prompts_spendingReview;
  "analyst/prompts/subscriptionReview": typeof analyst_prompts_subscriptionReview;
  "analyst/prompts/types": typeof analyst_prompts_types;
  "analyst/prompts/whatIf": typeof analyst_prompts_whatIf;
  "analyst/queries": typeof analyst_queries;
  "analyst/rateLimits": typeof analyst_rateLimits;
  "analyst/stream": typeof analyst_stream;
  "analyst/subscriptionMath": typeof analyst_subscriptionMath;
  "analyst/telegram": typeof analyst_telegram;
  "analyst/telegramActions": typeof analyst_telegramActions;
  "analyst/telegramCore": typeof analyst_telegramCore;
  "analyst/telegramRefs": typeof analyst_telegramRefs;
  "analyst/telemetry": typeof analyst_telemetry;
  "analyst/titles": typeof analyst_titles;
  "analyst/tools/debtPayoff": typeof analyst_tools_debtPayoff;
  "analyst/tools/forecast": typeof analyst_tools_forecast;
  "analyst/tools/index": typeof analyst_tools_index;
  "analyst/tools/longTermProjection": typeof analyst_tools_longTermProjection;
  "analyst/tools/memory": typeof analyst_tools_memory;
  "analyst/tools/moneyBoxOptimizer": typeof analyst_tools_moneyBoxOptimizer;
  "analyst/tools/present": typeof analyst_tools_present;
  "analyst/tools/read": typeof analyst_tools_read;
  "analyst/tools/search": typeof analyst_tools_search;
  "analyst/tools/simulate": typeof analyst_tools_simulate;
  "analyst/tools/write": typeof analyst_tools_write;
  "analyst/turnLocks": typeof analyst_turnLocks;
  "analyst/whatIfCore": typeof analyst_whatIfCore;
  "analyst/writes": typeof analyst_writes;
  auth: typeof auth;
  authProfiles: typeof authProfiles;
  "banking/accounts": typeof banking_accounts;
  "banking/balances": typeof banking_balances;
  "banking/cardStatementSettlement": typeof banking_cardStatementSettlement;
  "banking/categories": typeof banking_categories;
  "banking/categoryRuleCore": typeof banking_categoryRuleCore;
  "banking/categoryRules": typeof banking_categoryRules;
  "banking/categoryTaxonomy": typeof banking_categoryTaxonomy;
  "banking/connectionHealth": typeof banking_connectionHealth;
  "banking/credit": typeof banking_credit;
  "banking/creditMath": typeof banking_creditMath;
  "banking/creditValidation": typeof banking_creditValidation;
  "banking/csvImport": typeof banking_csvImport;
  "banking/dashboard": typeof banking_dashboard;
  "banking/enableBanking": typeof banking_enableBanking;
  "banking/enableBankingErrors": typeof banking_enableBankingErrors;
  "banking/enableBankingTransactionMapping": typeof banking_enableBankingTransactionMapping;
  "banking/loans": typeof banking_loans;
  "banking/manualAccounts": typeof banking_manualAccounts;
  "banking/manualTransactions": typeof banking_manualTransactions;
  "banking/overdraft": typeof banking_overdraft;
  "banking/payDown": typeof banking_payDown;
  "banking/plan": typeof banking_plan;
  "banking/planActivity": typeof banking_planActivity;
  "banking/planCardSettlements": typeof banking_planCardSettlements;
  "banking/planMath": typeof banking_planMath;
  "banking/planRead": typeof banking_planRead;
  "banking/planSnapshotInvalidation": typeof banking_planSnapshotInvalidation;
  "banking/planSystemBuckets": typeof banking_planSystemBuckets;
  "banking/planning": typeof banking_planning;
  "banking/planningMath": typeof banking_planningMath;
  "banking/planningReconciliation": typeof banking_planningReconciliation;
  "banking/planningSuggestionFunctions": typeof banking_planningSuggestionFunctions;
  "banking/planningSuggestions": typeof banking_planningSuggestions;
  "banking/providerMutations": typeof banking_providerMutations;
  "banking/providerQueries": typeof banking_providerQueries;
  "banking/reports": typeof banking_reports;
  "banking/reportsCore": typeof banking_reportsCore;
  "banking/safeToSpend": typeof banking_safeToSpend;
  "banking/safeToSpendCore": typeof banking_safeToSpendCore;
  "banking/savedReports": typeof banking_savedReports;
  "banking/scheduledTransactions": typeof banking_scheduledTransactions;
  "banking/statementCycles": typeof banking_statementCycles;
  "banking/subscriptionDetection": typeof banking_subscriptionDetection;
  "banking/syncCadence": typeof banking_syncCadence;
  "banking/syncWindow": typeof banking_syncWindow;
  "banking/transactionMeta": typeof banking_transactionMeta;
  "banking/transactions": typeof banking_transactions;
  "banking/transferCandidates": typeof banking_transferCandidates;
  "banking/transferCore": typeof banking_transferCore;
  "banking/transferMutations": typeof banking_transferMutations;
  "banking/transfers": typeof banking_transfers;
  crons: typeof crons;
  dataExport: typeof dataExport;
  entitlements: typeof entitlements;
  "forecast/forecastCore": typeof forecast_forecastCore;
  "forecast/liabilityMath": typeof forecast_liabilityMath;
  "forecast/projection": typeof forecast_projection;
  "forecast/projectionMath": typeof forecast_projectionMath;
  "forecast/scenarios": typeof forecast_scenarios;
  "forecast/seeds": typeof forecast_seeds;
  http: typeof http;
  "lib/accountTypes": typeof lib_accountTypes;
  "lib/entitlements": typeof lib_entitlements;
  "lib/money": typeof lib_money;
  "lib/notificationMessages": typeof lib_notificationMessages;
  "lib/validators": typeof lib_validators;
  migrations: typeof migrations;
  notificationDelivery: typeof notificationDelivery;
  notifications: typeof notifications;
  plannedTransactionsTestHelpers: typeof plannedTransactionsTestHelpers;
  subscriptions: typeof subscriptions;
  userSettings: typeof userSettings;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workOSAuthKit: import("@convex-dev/workos-authkit/_generated/component.js").ComponentApi<"workOSAuthKit">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
};
