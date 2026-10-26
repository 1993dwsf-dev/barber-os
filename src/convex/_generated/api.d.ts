/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as appointments from "../appointments.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as backup from "../backup.js";
import type * as billingSandbox from "../billingSandbox.js";
import type * as billingReconciliation from "../billingReconciliation.js";
import type * as barberPortal from "../barberPortal.js";
import type * as barbers from "../barbers.js";
import type * as cash from "../cash.js";
import type * as clients from "../clients.js";
import type * as commissions from "../commissions.js";
import type * as crm from "../crm.js";
import type * as dashboard from "../dashboard.js";
import type * as expenses from "../expenses.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as loyalty from "../loyalty.js";
import type * as notifications from "../notifications.js";
import type * as orgs from "../orgs.js";
import type * as platformAdmin from "../platformAdmin.js";
import type * as platformBilling from "../platformBilling.js";
import type * as products from "../products.js";
import type * as rateLimit from "../rateLimit.js";
import type * as reports from "../reports.js";
import type * as sales from "../sales.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as services from "../services.js";
import type * as users from "../users.js";
import type * as validation from "../validation.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  appointments: typeof appointments;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  backup: typeof backup;
  billingSandbox: typeof billingSandbox;
  billingReconciliation: typeof billingReconciliation;
  barberPortal: typeof barberPortal;
  barbers: typeof barbers;
  cash: typeof cash;
  clients: typeof clients;
  commissions: typeof commissions;
  crm: typeof crm;
  dashboard: typeof dashboard;
  expenses: typeof expenses;
  http: typeof http;
  lib: typeof lib;
  loyalty: typeof loyalty;
  notifications: typeof notifications;
  orgs: typeof orgs;
  platformAdmin: typeof platformAdmin;
  platformBilling: typeof platformBilling;
  products: typeof products;
  rateLimit: typeof rateLimit;
  reports: typeof reports;
  sales: typeof sales;
  search: typeof search;
  seed: typeof seed;
  services: typeof services;
  users: typeof users;
  validation: typeof validation;
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

export declare const components: {};
