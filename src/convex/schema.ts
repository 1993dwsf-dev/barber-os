import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/* ------------------------------ shared validators ------------------------------ */

export const ROLES = ["owner", "admin", "manager", "barber", "cashier", "viewer"] as const;
export const roleValidator = v.union(...ROLES.map((r) => v.literal(r)));
export type Role = (typeof ROLES)[number];

export const PAYMENT_METHODS = ["dinheiro", "debito", "credito", "pix"] as const;
export const paymentMethodValidator = v.union(...PAYMENT_METHODS.map((m) => v.literal(m)));

export const APPOINTMENT_STATUSES = [
  "agendado",
  "confirmado",
  "em_atendimento",
  "concluido",
  "cancelado",
  "falta",
] as const;
export const appointmentStatusValidator = v.union(
  ...APPOINTMENT_STATUSES.map((s) => v.literal(s)),
);

export const COMMISSION_MODELS = ["herdar", "percentual", "fixo"] as const;
export const commissionModelValidator = v.union(
  ...COMMISSION_MODELS.map((m) => v.literal(m)),
);

const weekdayHours = v.object({
  weekday: v.number(), // 0 = domingo ... 6 = sábado
  enabled: v.boolean(),
  start: v.string(), // "HH:MM"
  end: v.string(),
});

const orgSettings = v.object({
  activePaymentMethods: v.array(paymentMethodValidator),
  serviceCategories: v.array(v.string()),
  productCategories: v.array(v.string()),
  expenseCategories: v.array(v.string()),
  defaultCommissionModel: commissionModelValidator,
  defaultCommissionValue: v.number(), // percentual (0-100) ou valor fixo em centavos
  loyaltyPointsPerReal: v.number(), // pontos por R$1 gasto
  loyaltyVisitRule: v.object({ visits: v.number(), points: v.number() }),
  inactivityDays: v.number(),
  lowStockAlerts: v.boolean(),
  cancellationPolicy: v.string(),
  noShowPolicy: v.string(),
  appointmentSlotMin: v.number(),
  allowNegativeStock: v.boolean(),
});

/* ------------------------------ schema ------------------------------ */

const schema = defineSchema(
  {
    ...authTables,

    users: defineTable({
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
      role: v.optional(roleValidator),
    }).index("email", ["email"]),

    /* ------------------------------ tenancy / auth ------------------------------ */

    organizations: defineTable({
      name: v.string(),
      ownerId: v.id("users"),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      address: v.optional(v.string()),
      logoStorageId: v.optional(v.id("_storage")),
      businessHours: v.array(weekdayHours),
      settings: orgSettings,
      inviteCode: v.string(),
      isDemo: v.boolean(),
      onboardingStep: v.optional(v.number()), // 0..7, absent = concluído
      salesCount: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner", ["ownerId"])
      .index("by_invite", ["inviteCode"]),

    /** Convites comerciais administrados SOMENTE por funções internas. */
    commercialInvites: defineTable({
      code: v.string(), // 256 bits aleatórios; entregar apenas ao destinatário
      email: v.string(),
      trialDays: v.number(),
      expiresAt: v.number(),
      createdAt: v.number(),
      redeemedAt: v.optional(v.number()),
      organizationId: v.optional(v.id("organizations")),
    }).index("by_code", ["code"]),

    /** Direito de acesso da organização, controlado somente pelo servidor. */
    organizationEntitlements: defineTable({
      organizationId: v.id("organizations"),
      plan: v.union(v.literal("pilot"), v.literal("basic"), v.literal("pro")),
      status: v.union(
        v.literal("trialing"), v.literal("active"), v.literal("past_due"),
        v.literal("canceled"), v.literal("suspended"),
      ),
      trialEndsAt: v.optional(v.number()),
      periodEndsAt: v.optional(v.number()),
      graceEndsAt: v.optional(v.number()),
      source: v.union(v.literal("pilot"), v.literal("billing")),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_org", ["organizationId"]),

    organizationMembers: defineTable({
      organizationId: v.id("organizations"),
      userId: v.id("users"),
      role: roleValidator,
      displayName: v.optional(v.string()), // nome visível apenas nesta unidade
      barberId: v.optional(v.id("barbers")), // vinculação com perfil de barbeiro
      createdAt: v.number(),
    })
      .index("by_org", ["organizationId"])
      .index("by_user", ["userId"])
      .index("by_org_user", ["organizationId", "userId"]),

    /* ------------------------------ CRM ------------------------------ */

    clients: defineTable({
      organizationId: v.id("organizations"),
      name: v.string(),
      phone: v.string(),
      email: v.optional(v.string()),
      birthDate: v.optional(v.string()), // YYYY-MM-DD
      gender: v.optional(v.string()),
      preferredBarberId: v.optional(v.id("barbers")),
      tags: v.array(v.string()),
      notes: v.optional(v.string()),
      consentMarketing: v.boolean(),
      status: v.union(v.literal("ativo"), v.literal("inativo")),
      totalVisits: v.number(),
      totalSpentCents: v.number(),
      lastVisitDate: v.optional(v.string()), // YYYY-MM-DD
      createdBy: v.optional(v.id("users")),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_org", ["organizationId"])
      .index("by_org_phone", ["organizationId", "phone"])
      .index("by_org_lastVisit", ["organizationId", "lastVisitDate"])
      .searchIndex("search_name", {
        searchField: "name",
        filterFields: ["organizationId"],
      }),

    clientNotes: defineTable({
      organizationId: v.id("organizations"),
      clientId: v.id("clients"),
      body: v.string(),
      userId: v.id("users"),
      createdAt: v.number(),
    })
      .index("by_org", ["organizationId"])
      .index("by_client", ["clientId"]),

    /* ------------------------------ equipe ------------------------------ */

    barbers: defineTable({
      organizationId: v.id("organizations"),
      userId: v.optional(v.id("users")),
      name: v.string(),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      jobTitle: v.optional(v.string()),
      status: v.union(v.literal("ativo"), v.literal("inativo"), v.literal("ferias")),
      hireDate: v.optional(v.string()),
      commissionModel: commissionModelValidator, // herdar = usa default da org
      commissionValue: v.optional(v.number()),
      schedule: v.array(weekdayHours),
      notes: v.optional(v.string()),
      color: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_org", ["organizationId"])
      .searchIndex("search_name", {
        searchField: "name",
        filterFields: ["organizationId"],
      }),

    /* ------------------------------ catálogo ------------------------------ */

    services: defineTable({
      organizationId: v.id("organizations"),
      category: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      durationMin: v.number(),
      priceCents: v.number(),
      commissionModel: commissionModelValidator,
      commissionValue: v.optional(v.number()),
      active: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_org", ["organizationId"])
      .searchIndex("search_name", {
        searchField: "name",
        filterFields: ["organizationId"],
      }),

    // Tabelas legadas de pacotes/assinaturas, preservadas para compatibilidade com dados históricos.
    // Novas operações de produto não expõem criação, venda ou consumo desses registros.
    packages: defineTable({
      organizationId: v.id("organizations"),
      name: v.string(),
      description: v.optional(v.string()),
      priceCents: v.number(),
      validityDays: v.number(),
      items: v.array(v.object({ serviceId: v.id("services"), sessions: v.number() })),
      active: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_org", ["organizationId"]),

    clientPackages: defineTable({
      organizationId: v.id("organizations"),
      clientId: v.id("clients"),
      packageId: v.id("packages"),
      purchaseDate: v.string(),
      expiryDate: v.string(),
      creditsTotal: v.number(),
      creditsUsed: v.number(),
      pricePaidCents: v.number(),
      status: v.union(v.literal("ativo"), v.literal("esgotado"), v.literal("expirado")),
      saleId: v.optional(v.id("sales")),
      notes: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_org", ["organizationId"])
      .index("by_org_client", ["organizationId", "clientId"]),

    membershipPlans: defineTable({
      organizationId: v.id("organizations"),
      name: v.string(),
      description: v.optional(v.string()),
      priceCents: v.number(),
      items: v.array(v.object({ serviceId: v.id("services"), credits: v.number() })),
      benefits: v.array(v.string()),
      active: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_org", ["organizationId"]),

    memberships: defineTable({
      organizationId: v.id("organizations"),
      clientId: v.id("clients"),
      planId: v.id("membershipPlans"),
      startDate: v.string(),
      renewalDate: v.string(),
      status: v.union(v.literal("ativa"), v.literal("pausada"), v.literal("cancelada")),
      creditsTotal: v.number(),
      creditsUsed: v.number(),
      priceCents: v.number(),
      billingStatus: v.union(v.literal("em_dia"), v.literal("pendente")),
      cancelledAt: v.optional(v.number()),
      notes: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_org", ["organizationId"])
      .index("by_org_client", ["organizationId", "clientId"])
      .index("by_org_renewal", ["organizationId", "renewalDate"]),

    /* ------------------------------ agenda ------------------------------ */

    appointments: defineTable({
      organizationId: v.id("organizations"),
      clientId: v.id("clients"),
      barberId: v.id("barbers"),
      serviceId: v.id("services"),
      date: v.string(), // YYYY-MM-DD
      startTime: v.string(), // HH:MM
      durationMin: v.number(),
      priceCents: v.number(),
      status: appointmentStatusValidator,
      paymentStatus: v.union(v.literal("nao_pago"), v.literal("pago")),
      paymentMethod: v.optional(paymentMethodValidator),
      notes: v.optional(v.string()),
      source: v.union(
        v.literal("balcao"),
        v.literal("whatsapp"),
        v.literal("telefone"),
        v.literal("online"),
        v.literal("indicacao"),
      ),
      createdBy: v.optional(v.id("users")),
      saleId: v.optional(v.id("sales")),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_org", ["organizationId"])
      .index("by_org_date", ["organizationId", "date"])
      .index("by_org_barber_date", ["organizationId", "barberId", "date"])
      .index("by_org_client", ["organizationId", "clientId"])
      .index("by_org_status", ["organizationId", "status"]),

    waitlist: defineTable({
      organizationId: v.id("organizations"),
      clientId: v.id("clients"),
      barberId: v.optional(v.id("barbers")),
      serviceId: v.optional(v.id("services")),
      preferredDate: v.optional(v.string()),
      notes: v.optional(v.string()),
      status: v.union(v.literal("aguardando"), v.literal("atendido"), v.literal("cancelado")),
      createdAt: v.number(),
    }).index("by_org", ["organizationId"]),

    /* ------------------------------ produtos / estoque ------------------------------ */

    suppliers: defineTable({
      organizationId: v.id("organizations"),
      name: v.string(),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      notes: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_org", ["organizationId"]),

    products: defineTable({
      organizationId: v.id("organizations"),
      sku: v.optional(v.string()),
      name: v.string(),
      category: v.string(),
      supplierId: v.optional(v.id("suppliers")),
      costCents: v.number(),
      priceCents: v.number(),
      stock: v.number(),
      minStock: v.number(),
      unit: v.string(),
      active: v.boolean(),
      notes: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_org", ["organizationId"])
      .searchIndex("search_name", {
        searchField: "name",
        filterFields: ["organizationId"],
      }),

    inventoryMovements: defineTable({
      organizationId: v.id("organizations"),
      productId: v.id("products"),
      date: v.string(),
      quantity: v.number(), // sempre positivo; o tipo define o sinal
      type: v.union(
        v.literal("compra"),
        v.literal("venda"),
        v.literal("ajuste"),
        v.literal("devolucao"),
        v.literal("correcao"),
        v.literal("outro"),
      ),
      unitCostCents: v.optional(v.number()),
      reference: v.optional(v.string()),
      saleId: v.optional(v.id("sales")),
      userId: v.id("users"),
      notes: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_org", ["organizationId"])
      .index("by_org_product", ["organizationId", "productId"]),

    /* ------------------------------ vendas / PDV ------------------------------ */

    sales: defineTable({
      organizationId: v.id("organizations"),
      number: v.number(),
      date: v.string(),
      createdAt: v.number(),
      clientId: v.optional(v.id("clients")),
      barberId: v.optional(v.id("barbers")),
      appointmentId: v.optional(v.id("appointments")),
      subtotalCents: v.number(),
      discountCents: v.number(),
      totalCents: v.number(),
      costCents: v.number(),
      status: v.union(v.literal("concluida"), v.literal("cancelada")),
      notes: v.optional(v.string()),
      createdBy: v.id("users"),
    })
      .index("by_org", ["organizationId"])
      .index("by_org_date", ["organizationId", "date"])
      .index("by_org_client", ["organizationId", "clientId"])
      .index("by_org_barber", ["organizationId", "barberId"])
      .index("by_org_appointment", ["organizationId", "appointmentId"]),

    saleItems: defineTable({
      organizationId: v.id("organizations"),
      saleId: v.id("sales"),
      kind: v.union(
        v.literal("servico"),
        v.literal("produto"),
        v.literal("pacote"),
        v.literal("plano"),
      ),
      serviceId: v.optional(v.id("services")),
      productId: v.optional(v.id("products")),
      packageId: v.optional(v.id("packages")),
      planId: v.optional(v.id("membershipPlans")),
      appointmentId: v.optional(v.id("appointments")),
      clientPackageId: v.optional(v.id("clientPackages")),
      membershipId: v.optional(v.id("memberships")),
      name: v.string(),
      quantity: v.number(),
      unitPriceCents: v.number(),
      totalCents: v.number(),
      costCents: v.number(),
      coveredByCreditCents: v.number(), // Campo legado mantido para registros históricos; novas vendas gravam zero.
      barberId: v.optional(v.id("barbers")),
    }).index("by_sale", ["saleId"]).index("by_org", ["organizationId"]),

    payments: defineTable({
      organizationId: v.id("organizations"),
      saleId: v.id("sales"),
      method: paymentMethodValidator,
      amountCents: v.number(),
      date: v.string(),
      createdAt: v.number(),
    })
      .index("by_org", ["organizationId"])
      .index("by_sale", ["saleId"])
      .index("by_org_date", ["organizationId", "date"]),

    /* ------------------------------ caixa ------------------------------ */

    cashSessions: defineTable({
      organizationId: v.id("organizations"),
      openedAt: v.number(),
      openedDate: v.string(),
      closedAt: v.optional(v.number()),
      openingBalanceCents: v.number(),
      expectedCents: v.optional(v.number()),
      countedCents: v.optional(v.number()),
      varianceCents: v.optional(v.number()),
      status: v.union(v.literal("aberto"), v.literal("fechado")),
      openedBy: v.id("users"),
      closedBy: v.optional(v.id("users")),
      notes: v.optional(v.string()),
    })
      .index("by_org_status", ["organizationId", "status"])
      .index("by_org", ["organizationId"]),

    cashMovements: defineTable({
      organizationId: v.id("organizations"),
      sessionId: v.id("cashSessions"),
      type: v.union(
        v.literal("venda"),
        v.literal("entrada"),
        v.literal("saida"),
        v.literal("retirada"),
        v.literal("despesa"),
        v.literal("estorno"),
      ),
      amountCents: v.number(), // sempre positivo; tipo define direção
      description: v.string(),
      date: v.string(),
      userId: v.id("users"),
      saleId: v.optional(v.id("sales")),
      expenseId: v.optional(v.id("expenses")),
      createdAt: v.number(),
    })
      .index("by_session", ["sessionId"])
      .index("by_org", ["organizationId"]),

    /* ------------------------------ despesas ------------------------------ */

    expenses: defineTable({
      organizationId: v.id("organizations"),
      date: v.string(),
      category: v.string(),
      supplier: v.optional(v.string()),
      description: v.string(),
      amountCents: v.number(),
      method: paymentMethodValidator,
      recurring: v.boolean(),
      notes: v.optional(v.string()),
      fileStorageId: v.optional(v.id("_storage")),
      fileName: v.optional(v.string()),
      userId: v.id("users"),
      createdAt: v.number(),
    })
      .index("by_org_date", ["organizationId", "date"])
      .index("by_org", ["organizationId"]),

    /* ------------------------------ comissões ------------------------------ */

    commissions: defineTable({
      organizationId: v.id("organizations"),
      barberId: v.id("barbers"),
      saleId: v.id("sales"),
      appointmentId: v.optional(v.id("appointments")),
      serviceId: v.optional(v.id("services")),
      description: v.string(),
      date: v.string(),
      model: commissionModelValidator,
      ratePercent: v.optional(v.number()),
      baseCents: v.number(),
      amountCents: v.number(),
      status: v.union(v.literal("pendente"), v.literal("aprovada"), v.literal("paga")),
      paidDate: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_org", ["organizationId"])
      .index("by_org_barber", ["organizationId", "barberId"])
      .index("by_org_status", ["organizationId", "status"])
      .index("by_org_date", ["organizationId", "date"])
      .index("by_sale", ["saleId"]),

    /* ------------------------------ fidelidade ------------------------------ */

    loyaltyAccounts: defineTable({
      organizationId: v.id("organizations"),
      clientId: v.id("clients"),
      points: v.number(),
      totalEarned: v.number(),
      totalRedeemed: v.number(),
    })
      .index("by_org_client", ["organizationId", "clientId"])
      .index("by_org", ["organizationId"]),

    loyaltyTransactions: defineTable({
      organizationId: v.id("organizations"),
      clientId: v.id("clients"),
      type: v.union(v.literal("ganho"), v.literal("resgate"), v.literal("ajuste"), v.literal("bonus_visitas")),
      points: v.number(), // assinado
      reason: v.string(),
      saleId: v.optional(v.id("sales")),
      date: v.string(),
      createdAt: v.number(),
    })
      .index("by_org_client", ["organizationId", "clientId"])
      .index("by_org", ["organizationId"]),

    loyaltyRewards: defineTable({
      organizationId: v.id("organizations"),
      name: v.string(),
      description: v.optional(v.string()),
      pointsCost: v.number(),
      kind: v.union(v.literal("desconto"), v.literal("servico_gratis"), v.literal("produto")),
      valueCents: v.optional(v.number()),
      serviceId: v.optional(v.id("services")),
      productId: v.optional(v.id("products")),
      active: v.boolean(),
      createdAt: v.number(),
    }).index("by_org", ["organizationId"]),

    /* ------------------------------ CRM follow-ups ------------------------------ */

    followups: defineTable({
      organizationId: v.id("organizations"),
      clientId: v.id("clients"),
      reason: v.union(
        v.literal("inatividade"),
        v.literal("aniversario"),
        v.literal("renovacao"),
        v.literal("falta"),
        v.literal("pos_atendimento"),
        v.literal("personalizado"),
      ),
      title: v.string(),
      notes: v.optional(v.string()),
      ownerId: v.optional(v.id("users")),
      dueDate: v.string(),
      priority: v.union(v.literal("baixa"), v.literal("media"), v.literal("alta")),
      status: v.union(
        v.literal("pendente"),
        v.literal("em_andamento"),
        v.literal("concluido"),
        v.literal("descartado"),
      ),
      completedAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("by_org", ["organizationId"])
      .index("by_org_status", ["organizationId", "status"])
      .index("by_org_due", ["organizationId", "dueDate"])
      .index("by_org_client", ["organizationId", "clientId"]),

    feedback: defineTable({
      organizationId: v.id("organizations"),
      clientId: v.id("clients"),
      appointmentId: v.optional(v.id("appointments")),
      barberId: v.optional(v.id("barbers")),
      serviceId: v.optional(v.id("services")),
      rating: v.number(), // 1..5
      comment: v.optional(v.string()),
      internalNotes: v.optional(v.string()),
      date: v.string(),
      createdAt: v.number(),
    })
      .index("by_org", ["organizationId"])
      .index("by_org_barber", ["organizationId", "barberId"]),

    /* ------------------------------ notificações / auditoria / arquivos ------------------------------ */

    notifications: defineTable({
      organizationId: v.id("organizations"),
      type: v.string(),
      title: v.string(),
      message: v.string(),
      severity: v.union(v.literal("info"), v.literal("alerta"), v.literal("critico")),
      status: v.union(v.literal("nao_lida"), v.literal("lida"), v.literal("resolvida"), v.literal("descartada")),
      dedupKey: v.optional(v.string()),
      link: v.optional(v.string()),
      assignedTo: v.optional(v.id("users")),
      snoozedUntil: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("by_org", ["organizationId"])
      .index("by_org_status", ["organizationId", "status"])
      .index("by_org_dedup", ["organizationId", "dedupKey"]),

    auditLogs: defineTable({
      organizationId: v.id("organizations"),
      userId: v.optional(v.id("users")),
      userName: v.optional(v.string()),
      action: v.string(),
      module: v.string(),
      recordType: v.optional(v.string()),
      recordId: v.optional(v.string()), // id em texto (referência genérica)
      summary: v.string(),
      createdAt: v.number(),
    }).index("by_org", ["organizationId"]),

    files: defineTable({
      organizationId: v.id("organizations"),
      storageId: v.id("_storage"),
      recordType: v.string(),
      recordId: v.optional(v.string()),
      name: v.string(),
      mimeType: v.string(),
      size: v.number(),
      uploadedBy: v.id("users"),
      createdAt: v.number(),
    })
      .index("by_org", ["organizationId"])
      .index("by_org_storage", ["organizationId", "storageId"])
      .index("by_storage", ["storageId"]),

    /* ---------------------- catálogo comercial interno ---------------------- */

    // Rascunhos de planos do SaaS: não alteram entitlements e não cobram ninguém.
    platformPlanDrafts: defineTable({
      name: v.string(),
      description: v.string(),
      priceCents: v.number(),
      createdBy: v.id("users"),
      updatedBy: v.id("users"),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_updated", ["updatedAt"]),

    // Auditoria separada dos logs de cada barbearia.
    platformAdminAuditLogs: defineTable({
      actorId: v.id("users"),
      action: v.string(),
      recordType: v.string(),
      recordId: v.string(),
      createdAt: v.number(),
    }).index("by_created", ["createdAt"]),

    /* ------------------------------ limites de uso / abuso ------------------------------ */

    // Janela deslizante de tentativas por usuário e ação. Usado para barrar
    // força bruta (código de convite), criação em massa de organizações e
    // abuso de upload antes de qualquer trabalho de negócio ser executado.
    rateLimits: defineTable({
      key: v.string(), // `${action}:${userId}`
      action: v.string(),
      userId: v.optional(v.id("users")),
      createdAt: v.number(),
      expiresAt: v.number(),
    })
      .index("by_key", ["key"])
      .index("by_expires", ["expiresAt"]),
  },
  { schemaValidation: false },
);

export default schema;
