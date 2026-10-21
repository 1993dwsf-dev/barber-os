import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  awardLoyalty,
  commissionAmount,
  notify,
  resolveCommission,
} from "./lib";
import { addDaysISO, monthRange, todayISO, weekdayOf } from "../lib/dates";

/* RNG determinístico para que a demo seja sempre a mesma */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20240517);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const rint = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const chance = (p: number) => rnd() < p;

const BARBERS = [
  { name: "Rafael Mendes", jobTitle: "Barbeiro Sênior", phone: "(11) 98812-4471", model: "percentual" as const, value: 40, color: "#b45309" },
  { name: "Lucas Ferreira", jobTitle: "Barbeiro", phone: "(11) 99633-1207", model: "percentual" as const, value: 35, color: "#0f766e" },
  { name: "Thiago Ramos", jobTitle: "Barbeiro / Colorista", phone: "(11) 99145-8890", model: "percentual" as const, value: 30, color: "#1d4ed8" },
  { name: "Bruno Alves", jobTitle: "Barbeiro Júnior", phone: "(11) 98220-3312", model: "fixo" as const, value: 1800, color: "#7c3aed" },
];

const SERVICES = [
  { category: "Cabelo", name: "Corte Masculino", price: 4500, duration: 40 },
  { category: "Cabelo", name: "Corte Degradê", price: 5500, duration: 45 },
  { category: "Barba", name: "Barba Terapia", price: 3500, duration: 30 },
  { category: "Combo", name: "Corte + Barba", price: 7500, duration: 70 },
  { category: "Cabelo", name: "Corte Infantil", price: 4000, duration: 35 },
  { category: "Estética", name: "Pezinho", price: 2000, duration: 15 },
  { category: "Química", name: "Hidratação Capilar", price: 6000, duration: 40 },
  { category: "Barba", name: "Pigmentação de Barba", price: 4500, duration: 30 },
  { category: "Estética", name: "Sobrancelha", price: 1500, duration: 10 },
  { category: "Química", name: "Alisamento Masculino", price: 9000, duration: 60 },
];

const PRODUCTS = [
  { sku: "POM-001", name: "Pomada Modeladora Fixa", category: "Pomadas", cost: 1800, price: 3800, stock: 24, minStock: 8, unit: "un" },
  { sku: "OLE-002", name: "Óleo para Barba 60ml", category: "Óleos", cost: 1200, price: 4900, stock: 18, minStock: 6, unit: "un" },
  { sku: "SHA-003", name: "Shampoo Anticaspa 300ml", category: "Shampoos", cost: 1700, price: 3900, stock: 6, minStock: 6, unit: "un" },
  { sku: "BAL-004", name: "Balm Pós-Barba 120g", category: "Barba", cost: 2000, price: 4500, stock: 14, minStock: 5, unit: "un" },
  { sku: "TAL-005", name: "Talco Professional 150g", category: "Barba", cost: 700, price: 1800, stock: 3, minStock: 8, unit: "un" },
  { sku: "CER-006", name: "Cera Modeladora 100g", category: "Pomadas", cost: 1600, price: 3500, stock: 11, minStock: 5, unit: "un" },
  { sku: "LOC-007", name: "Loção Tônica degrowth 200ml", category: "Cabelo", cost: 3000, price: 6500, stock: 9, minStock: 4, unit: "un" },
  { sku: "ACE-008", name: "Pentes PROFISSIONAL (un)", category: "Acessórios", cost: 1500, price: 3200, stock: 22, minStock: 10, unit: "un" },
  { sku: "NAV-009", name: "Kit HidrataçãoHOME", category: "Cabelo", cost: 4200, price: 8900, stock: 7, minStock: 4, unit: "un" },
  { sku: "TES-010", name: "Tesoura profissional 6\"", category: "Acessórios", cost: 7000, price: 12900, stock: 2, minStock: 3, unit: "un" },
];

const CLIENTS = [
  { name: "André Luiz Ferreira", phone: "(11) 99871-2210", gender: "masculino" },
  { name: "Bruno Cardoso Silva", phone: "(11) 99120-7745", gender: "masculino" },
  { name: "Caio Henrique Duarte", phone: "(11) 98452-1187", gender: "masculino" },
  { name: "Diego Almeida Rocha", phone: "(11) 99733-5521", gender: "masculino" },
  { name: "Eduardo Marques Pinto", phone: "(11) 98009-3341", gender: "masculino" },
  { name: "Fábio Nogueira Costa", phone: "(11) 99564-8802", gender: "masculino" },
  { name: "Gustavo Prado Lima", phone: "(11) 98211-6674", gender: "masculino" },
  { name: "Henrique Sales Nunes", phone: "(11) 99890-2231", gender: "masculino" },
  { name: "Igor Batista Ramos", phone: "(11) 99045-7788", gender: "masculino" },
  { name: "João Pedro Vieira", phone: "(11) 98337-9912", gender: "masculino" },
  { name: "Kleber Moreira Dias", phone: "(11) 99672-4433", gender: "masculino" },
  { name: "Leandro Souza Castro", phone: "(11) 98156-2298", gender: "masculino" },
  { name: "Marcelo Tavares Luz", phone: "(11) 99401-5567", gender: "masculino" },
  { name: "Nelson Ribeiro Paes", phone: "(11) 98890-1123", gender: "masculino" },
  { name: "Otávio Ramos Freitas", phone: "(11) 98234-6677", gender: "masculino" },
  { name: "Paulo Sérgio Menezes", phone: "(11) 99012-3345", gender: "masculino" },
  { name: "Renato Azevedo Cruz", phone: "(11) 99580-7712", gender: "masculino" },
  { name: "Samuel Braga Nunes", phone: "(11) 98445-9901", gender: "masculino" },
  { name: "Tiago Figueiredo Souza", phone: "(11) 99731-2204", gender: "masculino" },
  { name: "Vitor Hugo Campos", phone: "(11) 98066-8890", gender: "masculino" },
  { name: "Wesley Ribeiro Amorim", phone: "(11) 99215-4432", gender: "masculino" },
  { name: "Yuri Oliveira Patton", phone: "(11) 98670-5519", gender: "masculino" },
  { name: "Zeca Batista Reine", phone: "(11) 99802-7746", gender: "masculino" },
  { name: "Anderson Farias Nunes", phone: "(11) 98345-1128", gender: "masculino" },
  { name: "Cristiano Luz Alves", phone: "(11) 99174-6690", gender: "masculino" },
  { name: "Danilo Freitas Rocha", phone: "(11) 98512-3347", gender: "masculino" },
];

const TAGS = ["VIP", "Cliente novo", "Prefere tarde", "Aluno", "Indicação", "Empresa", "Fiel"];

const now = Date.now();
const today = todayISO(now);
const HOURS: Record<number, { start: number; end: number }> = {
  0: { start: 0, end: 0 },
  1: { start: 9 * 60, end: 19 * 60 },
  2: { start: 9 * 60, end: 19 * 60 },
  3: { start: 9 * 60, end: 19 * 60 },
  4: { start: 9 * 60, end: 19 * 60 },
  5: { start: 9 * 60, end: 19 * 60 },
  6: { start: 9 * 60, end: 18 * 60 },
};

export async function seedDemoData(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  userId?: Id<"users">,
): Promise<void> {
  const org = await ctx.db.get(organizationId);
  if (!org) return;
  const responsible = userId ?? org.ownerId;
  const pastDays = 45;

  /* --------------------------- equipe --------------------------- */
  // Mantemos os documentos em memória: o seed gera centenas de vendas e cada
  // `ctx.db.get` extra conta como leitura de índice na mesma transação.
  const barberIds: Array<Id<"barbers">> = [];
  const barberDocs = new Map<Id<"barbers">, Doc<"barbers">>();
  for (const b of BARBERS) {
    const payload = {
      organizationId,
      name: b.name,
      jobTitle: b.jobTitle,
      phone: b.phone,
      email: `${b.name.split(" ")[0].toLowerCase()}@navalhadeouro.demo`,
      status: "ativo" as const,
      hireDate: addDaysISO(today, -rint(400, 1200)),
      commissionModel: b.model,
      commissionValue: b.value,
      schedule: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        enabled: weekday >= 1 && weekday <= 5,
        start: "09:00",
        end: weekday === 6 ? "18:00" : "19:00",
      })),
      color: b.color,
      createdAt: now,
      updatedAt: now,
    };
    const id = await ctx.db.insert("barbers", payload);
    barberIds.push(id);
    barberDocs.set(id, { _id: id, _creationTime: now, ...payload });
  }

  /* --------------------------- serviços --------------------------- */
  const serviceIds: Id<"services">[] = [];
  const serviceDocs = new Map<Id<"services">, Doc<"services">>();
  for (const s of SERVICES) {
    const payload = {
      organizationId,
      category: s.category,
      name: s.name,
      description: undefined,
      durationMin: s.duration,
      priceCents: s.price,
      commissionModel: "herdar" as const,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    const id = await ctx.db.insert("services", payload);
    serviceIds.push(id);
    serviceDocs.set(id, { _id: id, _creationTime: now, ...payload });
  }
  const svc = (i: number) => ({ id: serviceIds[i], ...SERVICES[i] });

  /* --------------------------- fornecedores / produtos --------------------------- */
  const supplierIds: Id<"suppliers">[] = [];
  for (const s of [
    { name: "Distribuidora BarberPro", phone: "(11) 3777-1200", email: "vendas@barberpro.com.br" },
    { name: "Atacadão da Barba", phone: "(11) 3222-8890", email: "contato@atacadaodabarba.com.br" },
  ]) {
    supplierIds.push(
      await ctx.db.insert("suppliers", { organizationId, ...s, createdAt: now }),
    );
  }

  const productIds: Id<"products">[] = [];
  const productStock: Record<string, number> = {};
  for (const [i, p] of PRODUCTS.entries()) {
    const id = await ctx.db.insert("products", {
      organizationId,
      sku: p.sku,
      name: p.name,
      category: p.category,
      supplierId: supplierIds[i % supplierIds.length],
      costCents: p.cost,
      priceCents: p.price,
      stock: p.stock,
      minStock: p.minStock,
      unit: p.unit,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    productIds.push(id);
    productStock[id as string] = p.stock + rint(4, 14); // estoque inicial + compras
    await ctx.db.insert("inventoryMovements", {
      organizationId,
      productId: id,
      date: addDaysISO(today, -pastDays),
      quantity: p.stock + rint(4, 14),
      type: "compra",
      unitCostCents: p.cost,
      reference: "CompraNF 20441",
      userId: responsible,
      notes: "Reposição mensal",
      createdAt: now,
    });
  }

  /* --------------------------- clientes --------------------------- */
  const clientIds: Id<"clients">[] = [];
  for (const [i, c] of CLIENTS.entries()) {
    const hasBirthday = i % 3 !== 0;
    const birthMonth = rint(1, 12);
    const birthDay = rint(1, 28);
    const id = await ctx.db.insert("clients", {
      organizationId,
      name: c.name,
      phone: c.phone,
      email: `${c.name.toLowerCase().split(" ")[0]}.${i}@email.com`,
      birthDate: hasBirthday ? `19${birthMonth > 20 ? "8" : "9"}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}` : undefined,
      gender: c.gender,
      preferredBarberId: barberIds[i % barberIds.length],
      tags: chance(0.4) ? [pick(TAGS)] : chance(0.2) ? [pick(TAGS), pick(TAGS)] : [],
      consentMarketing: chance(0.8),
      status: "ativo",
      totalVisits: 0,
      totalSpentCents: 0,
      createdAt: now,
      updatedAt: now,
    });
    clientIds.push(id);
  }

  // Totais de caixa acumulados em memória: o seed relia os movimentos de cada
  // sessão no fim do dia (um scan por dia de operação dentro da transação).
  const cashInBySession = new Map<Id<"cashSessions">, number>();
  const cashOutBySession = new Map<Id<"cashSessions">, number>();
  const sessionByDate = new Map<string, Id<"cashSessions">>();

  /* --------------------------- caixa: sessão aberta hoje --------------------------- */
  const todaySessionId = await ctx.db.insert("cashSessions", {
    organizationId,
    openedAt: now,
    openedDate: today,
    openingBalanceCents: 20000,
    status: "aberto",
    openedBy: responsible,
  });
  sessionByDate.set(today, todaySessionId);

  /* --------------------------- vendas / comissões / fidelidade --------------------------- */
  let saleNumber = org.salesCount;
  const clientStats = new Map<string, { visits: number; spent: number; last: string }>();

  const bumpClient = (clientId: string, cents: number, visit: boolean, date: string) => {
    const prev = clientStats.get(clientId) ?? { visits: 0, spent: 0, last: "" };
    clientStats.set(clientId, {
      visits: prev.visits + (visit ? 1 : 0),
      spent: prev.spent + cents,
      last: prev.last > date ? prev.last : date,
    });
  };

  const createSale = async (args: {
    date: string;
    time: string;
    clientId?: Id<"clients">;
    barberId?: Id<"barbers">;
    appointmentId?: Id<"appointments">;
    items: Array<{
      kind: "servico" | "produto";
      name: string;
      qty: number;
      unit: number;
      cost?: number;
      barberId?: Id<"barbers">;
      serviceId?: Id<"services">;
      productId?: Id<"products">;
    }>;
    paymentMethod?: "dinheiro" | "debito" | "credito" | "pix";
    sessionId?: Id<"cashSessions">;
  }): Promise<{ saleId: Id<"sales">; total: number }> => {
    const subtotal = args.items.reduce((s, i) => s + i.unit * i.qty, 0);
    const moneyDue = subtotal;
    const cost = args.items.reduce((s, i) => s + (i.cost ?? 0) * i.qty, 0);
    saleNumber += 1;
    const saleId = await ctx.db.insert("sales", {
      organizationId,
      number: saleNumber,
      date: args.date,
      createdAt: Date.parse(`${args.date}T${args.time}:00-03:00`),
      clientId: args.clientId,
      barberId: args.barberId,
      appointmentId: args.appointmentId,
      subtotalCents: subtotal,
      discountCents: 0,
      totalCents: subtotal,
      costCents: cost,
      status: "concluida",
      createdBy: responsible,
    });
    for (const item of args.items) {
      await ctx.db.insert("saleItems", {
        organizationId,
        saleId,
        kind: item.kind,
        serviceId: item.serviceId,
        productId: item.productId,
        appointmentId: args.appointmentId,
        name: item.name,
        quantity: item.qty,
        unitPriceCents: item.unit,
        totalCents: item.unit * item.qty,
        costCents: (item.cost ?? 0) * item.qty,
        coveredByCreditCents: 0,
        barberId: item.barberId,
      });
      if (item.kind === "produto" && item.productId) {
        const product = await ctx.db.get(item.productId);
        if (product) {
          await ctx.db.patch(product._id, {
            stock: product.stock - item.qty,
            updatedAt: now,
          });
          await ctx.db.insert("inventoryMovements", {
            organizationId,
            productId: product._id,
            date: args.date,
            quantity: item.qty,
            type: "venda",
            reference: `Venda #${saleNumber}`,
            saleId,
            userId: responsible,
            createdAt: now,
          });
        }
      }
      if (item.kind === "servico" && item.barberId) {
        // Docs vêm de mapas já carregados; um `db.get` por item de venda
        // estourava o orçamento de leituras da transação do seed.
        const barber = barberDocs.get(item.barberId);
        const service = item.serviceId ? serviceDocs.get(item.serviceId) : undefined;
        if (barber) {
          const rule = resolveCommission(barber, service, org);
          const calc = commissionAmount(rule, item.unit * item.qty, item.qty);
          // Cada venda recebe um saleId novo, então não há duplicata a verificar.
          // O scan de deduplicação anterior lia a coleção de comissões inteira
          // do barbeiro a cada item e estourava os limites da transação.
          await ctx.db.insert("commissions", {
            organizationId,
            barberId: barber._id,
            saleId,
            appointmentId: args.appointmentId,
            serviceId: item.serviceId,
            description: item.name,
            date: args.date,
            model: calc.model,
            ratePercent: calc.ratePercent,
            baseCents: item.unit * item.qty,
            amountCents: calc.amount,
            status: "pendente",
            createdAt: now,
          });
        }
      }
    }
    if (moneyDue > 0 && args.paymentMethod) {
      await ctx.db.insert("payments", {
        organizationId,
        saleId,
        method: args.paymentMethod,
        amountCents: moneyDue,
        date: args.date,
        createdAt: now,
      });
      if (args.paymentMethod === "dinheiro" && args.sessionId) {
        await ctx.db.insert("cashMovements", {
          organizationId,
          sessionId: args.sessionId,
          type: "venda",
          amountCents: moneyDue,
          description: `Venda #${saleNumber}`,
          date: args.date,
          userId: responsible,
          saleId,
          createdAt: now,
        });
        cashInBySession.set(
          args.sessionId,
          (cashInBySession.get(args.sessionId) ?? 0) + moneyDue,
        );
      }
    }
    if (args.clientId) {
      bumpClient(args.clientId, moneyDue, args.items.some((i) => i.kind === "servico"), args.date);
      if (moneyDue > 0) await awardLoyalty(ctx, org, args.clientId, moneyDue, saleId);
      const visitBonus = org.settings.loyaltyVisitRule;
      const stats = clientStats.get(args.clientId)!;
      if (visitBonus.visits > 0 && stats.visits > 0 && stats.visits % visitBonus.visits === 0) {
        const acct = await ctx.db
          .query("loyaltyAccounts")
          .withIndex("by_org_client", (q) =>
            q.eq("organizationId", organizationId).eq("clientId", args.clientId!),
          )
          .first();
        if (acct) {
          await ctx.db.patch(acct._id, {
            points: acct.points + visitBonus.points,
            totalEarned: acct.totalEarned + visitBonus.points,
          });
          await ctx.db.insert("loyaltyTransactions", {
            organizationId,
            clientId: args.clientId,
            type: "bonus_visitas",
            points: visitBonus.points,
            reason: `Bônus de ${visitBonus.visits} visitas`,
            saleId,
            date: args.date,
            createdAt: now,
          });
        }
      }
    }
    return { saleId, total: subtotal };
  };

  const PAYMENT_WEIGHTS: Array<["dinheiro" | "debito" | "credito" | "pix", number]> = [
    ["pix", 30],
    ["credito", 25],
    ["debito", 20],
    ["dinheiro", 25],
  ];
  const pickPayment = () => {
    const roll = rint(1, 100);
    let acc = 0;
    for (const [m, w] of PAYMENT_WEIGHTS) {
      acc += w;
      if (roll <= acc) return m;
    }
    return "pix" as const;
  };

  /* --------------------------- agenda histórica + futura --------------------------- */
  const feedbackPool: Array<{ barberId: Id<"barbers">; serviceId: Id<"services">; rating: number; comment: string }> = [
    { barberId: barberIds[0], serviceId: serviceIds[0], rating: 5, comment: "Corte impecável, como sempre!" },
    { barberId: barberIds[1], serviceId: serviceIds[3], rating: 5, comment: "Atendimento excelente e rápido." },
    { barberId: barberIds[2], serviceId: serviceIds[6], rating: 4, comment: "Muito bom, só achei a água fria." },
    { barberId: barberIds[0], serviceId: serviceIds[2], rating: 5, comment: "Barba perfeita, ambientação ótima." },
    { barberId: barberIds[3], serviceId: serviceIds[0], rating: 4, comment: "Bom corte, preço justo." },
    { barberId: barberIds[1], serviceId: serviceIds[5], rating: 3, comment: "Demorou um pouco, mas ficou bom." },
    { barberId: barberIds[2], serviceId: serviceIds[0], rating: 5, comment: "Voltarei sempre!" },
    { barberId: barberIds[0], serviceId: serviceIds[6], rating: 5, comment: "Hidratação fez diferença." },
  ];

  const bookAppointment = async (args: {
    clientId: Id<"clients">;
    barberId: Id<"barbers">;
    serviceIndex: number;
    date: string;
    time: string;
    status: "agendado" | "confirmado" | "em_atendimento" | "concluido" | "cancelado" | "falta";
    source: "balcao" | "whatsapp" | "telefone" | "online" | "indicacao";
    sessionId?: Id<"cashSessions">;
  }): Promise<Id<"appointments"> | null> => {
    const service = svc(args.serviceIndex);
    const apptId = await ctx.db.insert("appointments", {
      organizationId,
      clientId: args.clientId,
      barberId: args.barberId,
      serviceId: service.id,
      date: args.date,
      startTime: args.time,
      durationMin: service.duration,
      priceCents: service.price,
      status: args.status,
      paymentStatus: "nao_pago",
      notes: chance(0.15) ? "Cliente pediu para não esperar muito." : undefined,
      source: args.source,
      createdBy: responsible,
      createdAt: now,
      updatedAt: now,
    });

    if (args.status === "concluido") {
      const extraProduct = chance(0.22) ? rint(0, PRODUCTS.length - 1) : -1;
      const productDoc = extraProduct >= 0 ? await ctx.db.get(productIds[extraProduct]) : null;
      const canSell = productDoc && productDoc.stock > 0;

      const sale = await createSale({
        date: args.date,
        time: args.time,
        clientId: args.clientId,
        barberId: args.barberId,
        appointmentId: apptId,
        items: [
          {
            kind: "servico",
            name: service.name,
            qty: 1,
            unit: service.price,
            barberId: args.barberId,
            serviceId: service.id,
          },
          ...(canSell
            ? [
                {
                  kind: "produto" as const,
                  name: productDoc.name,
                  qty: 1,
                  unit: productDoc.priceCents,
                  cost: productDoc.costCents,
                  productId: productDoc._id,
                },
              ]
            : []),
        ],
        paymentMethod: pickPayment(),
        sessionId: args.sessionId,
      });

      await ctx.db.patch(apptId, {
        status: "concluido",
        paymentStatus: "pago",
        saleId: sale.saleId,
        updatedAt: now,
      });

      if (chance(0.3)) {
        const f = pick(feedbackPool);
        await ctx.db.insert("feedback", {
          organizationId,
          clientId: args.clientId,
          appointmentId: apptId,
          barberId: args.barberId,
          serviceId: service.id,
          rating: f.rating,
          comment: f.comment,
          date: args.date,
          createdAt: now,
        });
      }
      if (chance(0.06)) {
        await ctx.db.insert("followups", {
          organizationId,
          clientId: args.clientId,
          reason: "pos_atendimento",
          title: `Cobrar retorno de ${args.clientId === clientIds[0] ? "cliente" : "cliente"}`,
          notes: "Verificar satisfação após o atendimento.",
          ownerId: responsible,
          dueDate: addDaysISO(args.date, 2),
          priority: "baixa",
          status: "pendente",
          createdAt: now,
        });
      }
    }
    if (args.status === "falta" && chance(0.5)) {
      await ctx.db.insert("followups", {
        organizationId,
        clientId: args.clientId,
        reason: "falta",
        title: "Recuperar cliente após falta",
        notes: "Cliente faltou ao horário marcado.",
        ownerId: responsible,
        dueDate: addDaysISO(args.date, 1),
        priority: "alta",
        status: "pendente",
        createdAt: now,
      });
    }
    return apptId;
  };

  // sessões de caixa fechadas por dia
  for (let d = pastDays; d >= 1; d--) {
    const date = addDaysISO(today, -d);
    const wd = weekdayOf(date);
    if (HOURS[wd].end === 0) continue;
    const sessionId = await ctx.db.insert("cashSessions", {
      organizationId,
      openedAt: Date.parse(`${date}T08:00:00-03:00`),
      openedDate: date,
      openingBalanceCents: 20000,
      status: "aberto",
      openedBy: responsible,
    });
    sessionByDate.set(date, sessionId);
    // caixa do dia é fechado no fim com os movimentos gerados pelas vendas
    for (const barberId of barberIds) {
      const count = rint(2, 4);
      let cursor = HOURS[wd].start;
      for (let k = 0; k < count; k++) {
        const dur = 30 + rint(0, 3) * 10;
        if (cursor + dur > HOURS[wd].end) break;
        const time = `${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`;
        const status = chance(0.88) ? "concluido" : chance(0.5) ? "cancelado" : "falta";
        await bookAppointment({
          clientId: pick(clientIds),
          barberId,
          serviceIndex: rint(0, SERVICES.length - 1),
          date,
          time,
          status: status as never,
          source: pick(["balcao", "whatsapp", "telefone", "online", "indicacao"] as const),
          sessionId,
        });
        cursor += dur + rint(0, 3) * 5;
      }
    }
    // despesas em dinheiro do dia viram saídas de caixa
    if (rnd() < 0.2) {
      const amount = rint(1500, 6000);
      await ctx.db.insert("cashMovements", {
        organizationId,
        sessionId,
        type: "saida",
        amountCents: amount,
        description: "Saída de caixa (compras do dia)",
        date,
        userId: responsible,
        createdAt: now,
      });
      cashOutBySession.set(sessionId, (cashOutBySession.get(sessionId) ?? 0) + amount);
    }
    const cashSales = cashInBySession.get(sessionId) ?? 0;
    const outs = cashOutBySession.get(sessionId) ?? 0;
    const expected = 20000 + cashSales - outs;
    const variance = rnd() < 0.3 ? rint(-1500, 1500) : 0;
    await ctx.db.patch(sessionId, {
      closedAt: Date.parse(`${date}T20:00:00-03:00`),
      expectedCents: expected,
      countedCents: expected + variance,
      varianceCents: variance,
      status: "fechado",
      closedBy: responsible,
    });
  }

  // hoje: concluídos + em andamento + próximos
  const todayStatusQueue: Array<"concluido" | "agendado" | "confirmado" | "em_atendimento"> = [];
  for (let i = 0; i < 9; i++) todayStatusQueue.push("concluido");
  for (let i = 0; i < 3; i++) todayStatusQueue.push("agendado");
  for (let i = 0; i < 2; i++) todayStatusQueue.push("confirmado");
  todayStatusQueue.push("em_atendimento");
  let queueIdx = 0;
  for (const barberId of barberIds) {
    const count = rint(3, 5);
    let cursor = 8 * 60 + rint(0, 6) * 30;
    for (let k = 0; k < count && queueIdx < todayStatusQueue.length; k++) {
      const dur = 30 + rint(0, 3) * 10;
      if (cursor + dur > 19 * 60) break;
      const time = `${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`;
      const status = todayStatusQueue[queueIdx++];
      await bookAppointment({
        clientId: pick(clientIds),
        barberId,
        serviceIndex: rint(0, SERVICES.length - 1),
        date: today,
        time,
        status,
        source: pick(["balcao", "whatsapp", "telefone", "online", "indicacao"] as const),
        sessionId: todaySessionId,
      });
      cursor += dur + rint(0, 2) * 15;
    }
  }

  // próximos 7 dias
  for (let d = 1; d <= 7; d++) {
    const date = addDaysISO(today, d);
    const wd = weekdayOf(date);
    if (HOURS[wd].end === 0) continue;
    for (const barberId of barberIds) {
      const count = rint(2, 5);
      let cursor = HOURS[wd].start + rint(0, 4) * 15;
      for (let k = 0; k < count; k++) {
        const dur = 30 + rint(0, 3) * 10;
        if (cursor + dur > HOURS[wd].end) break;
        const time = `${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`;
        await bookAppointment({
          clientId: pick(clientIds),
          barberId,
          serviceIndex: rint(0, SERVICES.length - 1),
          date,
          time,
          status: chance(0.7) ? "confirmado" : "agendado",
          source: pick(["whatsapp", "telefone", "online", "balcao"] as const),
        });
        cursor += dur + rint(0, 3) * 5;
      }
    }
  }

  /* --------------------------- espera (waitlist) --------------------------- */
  for (let i = 0; i < 4; i++) {
    await ctx.db.insert("waitlist", {
      organizationId,
      clientId: clientIds[(i * 5) % clientIds.length],
      barberId: barberIds[i % barberIds.length],
      serviceId: serviceIds[i % serviceIds.length],
      preferredDate: addDaysISO(today, rint(0, 2)),
      notes: "Cliente prefere horários depois das 17h.",
      status: "aguardando",
      createdAt: now,
    });
  }

  /* --------------------------- despesas --------------------------- */
  const expenseDefs = [
    { category: "Aluguel", supplier: "Imobiliária Vila Nova", description: "Aluguel do ponto comercial", amount: 280000, method: "debito" as const },
    { category: "Energia", supplier: "Enel", description: "Conta de energia elétrica", amount: 38000, method: "debito" as const },
    { category: "Água", supplier: "Sabesp", description: "Conta de água", amount: 12000, method: "debito" as const },
    { category: "Internet", supplier: "Vivo Fibra", description: "Internet dedicada", amount: 13000, method: "credito" as const },
    { category: "Software", supplier: "BarberFlow OS", description: "Assinatura do sistema de gestão", amount: 14990, method: "pix" as const },
    { category: "Marketing", supplier: "Meta Ads", description: "Campanha de aquisição no Instagram", amount: 45000, method: "credito" as const },
    { category: "Insumos", supplier: "Distribuidora BarberPro", description: "Reposição de produtos e insumos", amount: 68000, method: "pix" as const },
    { category: "Manutenção", supplier: "Serralaria Silva", description: "Manutenção da cadeira hidráulica", amount: 32000, method: "dinheiro" as const },
    { category: "Folha de pagamento", supplier: "Equipe interna", description: "Salários recepção e limpeza", amount: 210000, method: "dinheiro" as const },
    { category: "Impostos", supplier: "Receita Federal", description: "Simples Nacional", amount: 95000, method: "pix" as const },
  ];
  for (let m = 0; m < 4; m++) {
    const monthStart = monthRange(addDaysISO(today, -30 * m)).start;
    for (const e of expenseDefs) {
      if (e.category === "Manutenção" && !chance(0.4)) continue;
      if (e.category === "Marketing" && m > 2) continue;
      const day = e.category === "Aluguel" ? "05" : String(rint(1, 26)).padStart(2, "0");
      const date = `${monthStart.slice(0, 7)}-${day}`;
      if (date > today) continue;
      const amount = Math.round(e.amount * (0.92 + rnd() * 0.2));
      const expId = await ctx.db.insert("expenses", {
        organizationId,
        date,
        category: e.category,
        supplier: e.supplier,
        description: e.description,
        amountCents: amount,
        method: e.method,
        recurring: ["Aluguel", "Energia", "Água", "Internet", "Software", "Folha de pagamento"].includes(e.category),
        userId: responsible,
        createdAt: now,
      });
      if (e.method === "dinheiro") {
        // Mapa em memória: antes isso varria todas as sessões de caixa da
        // organização em cada despesa (dezenas de scans dentro da transação).
        const sessionId = sessionByDate.get(date);
        if (sessionId) {
          await ctx.db.insert("cashMovements", {
            organizationId,
            sessionId,
            type: "despesa",
            amountCents: amount,
            description: e.description,
            date,
            userId: responsible,
            expenseId: expId,
            createdAt: now,
          });
        }
      }
    }
  }

  /* --------------------------- fidelidade: recompensas --------------------------- */
  const rewardDefs = [
    { name: "Corte grátis", description: "Um corte masculino cortesia", points: 150, kind: "servico_gratis" as const, value: 4500, serviceId: serviceIds[0] },
    { name: "R$ 20 de desconto", description: "Desconto em qualquer serviço", points: 100, kind: "desconto" as const, value: 2000 },
    { name: "Hidratação cortesia", description: "Hidratação capilar free", points: 120, kind: "servico_gratis" as const, value: 6000, serviceId: serviceIds[6] },
    { name: "Pomada modeladora", description: "Pomada 80g", points: 90, kind: "produto" as const, value: 3800, productId: productIds[0] },
  ];
  for (const r of rewardDefs) {
    await ctx.db.insert("loyaltyRewards", {
      organizationId,
      name: r.name,
      description: r.description,
      pointsCost: r.points,
      kind: r.kind,
      valueCents: r.value,
      serviceId: (r as { serviceId?: Id<"services"> }).serviceId,
      productId: (r as { productId?: Id<"products"> }).productId,
      active: true,
      createdAt: now,
    });
  }

  /* --------------------------- persistir estatísticas dos clientes --------------------------- */
  for (const [clientId, stats] of clientStats.entries()) {
    await ctx.db.patch(clientId as Id<"clients">, {
      totalVisits: stats.visits,
      totalSpentCents: stats.spent,
      lastVisitDate: stats.last,
      updatedAt: now,
    });
  }
  // base de clientes inclui os que nunca voltaram
  for (const clientId of clientIds) {
    const has = clientStats.get(clientId as string);
    if (has) continue;
    const createdAgo = rint(60, 150);
    await ctx.db.patch(clientId as Id<"clients">, {
      totalVisits: rint(1, 2),
      totalSpentCents: rint(4500, 9000),
      lastVisitDate: addDaysISO(today, -rint(60, 130)),
      createdAt: now - createdAgo * 86_400_000,
      updatedAt: now,
    });
  }

  /* --------------------------- follow-ups de inatividade / aniversário / renovação --------------------------- */
  let followupCount = 0;
  for (const clientId of clientIds) {
    const client = await ctx.db.get(clientId);
    if (!client) continue;
    if (client.lastVisitDate && followupCount < 8) {
      const days = Math.round(
        (Date.parse(`${today}T00:00:00-03:00`) - Date.parse(`${client.lastVisitDate}T00:00:00-03:00`)) / 86_400_000,
      );
      if (days > org.settings.inactivityDays) {
        await ctx.db.insert("followups", {
          organizationId,
          clientId,
          reason: "inatividade",
          title: `${client.name} está ${days} dias sem vir`,
          notes: "Oferecer combo ou cortesia para reativar.",
          ownerId: responsible,
          dueDate: addDaysISO(today, rint(-3, 3)),
          priority: days > 90 ? "alta" : "media",
          status: "pendente",
          createdAt: now,
        });
        followupCount++;
      }
    }
    if (client.birthDate && followupCount < 12) {
      const mmdd = client.birthDate.slice(5);
      const near = [0, 1, 2, 3, 4, 5, 6, 7].some((i) => addDaysISO(today, i).slice(5) === mmdd);
      if (near) {
        await ctx.db.insert("followups", {
          organizationId,
          clientId,
          reason: "aniversario",
          title: `Aniversário de ${client.name}`,
          notes: "Mandar mensagem de parabéns com cortesia.",
          ownerId: responsible,
          dueDate: today,
          priority: "media",
          status: "pendente",
          createdAt: now,
        });
        followupCount++;
      }
    }
  }

  /* --------------------------- notificações operacionais --------------------------- */
  for (const productId of productIds) {
    const product = await ctx.db.get(productId);
    if (!product || product.stock > product.minStock) continue;
    await notify(ctx, organizationId, {
      type: "estoque_baixo",
      title: "Estoque baixo",
      message: `${product.name}: ${product.stock} ${product.unit} em estoque (mínimo ${product.minStock}).`,
      severity: product.stock <= 0 ? "critico" : "alerta",
      dedupKey: `estoque_baixo:${product._id}:${product.stock <= 0 ? "zero" : "min"}`,
      link: "/app/estoque",
    });
  }
  const todayAppts = await ctx.db
    .query("appointments")
    .withIndex("by_org_date", (q) => q.eq("organizationId", organizationId).eq("date", today))
    .collect();
  const upcoming = todayAppts.filter((a) => a.status === "agendado" || a.status === "confirmado");
  if (upcoming.length > 0) {
    await notify(ctx, organizationId, {
      type: "agenda_hoje",
      title: "Agenda de hoje",
      message: `${upcoming.length} atendimento(s) ainda não concluídos hoje.`,
      severity: "info",
      dedupKey: `agenda_hoje:${today}`,
      link: "/app/agenda",
    });
  }
  const pendingCommissions = await ctx.db
    .query("commissions")
    .withIndex("by_org_status", (q) => q.eq("organizationId", organizationId).eq("status", "pendente"))
    .collect();
  if (pendingCommissions.length > 0) {
    await notify(ctx, organizationId, {
      type: "comissoes",
      title: "Comissões a pagar",
      message: `${pendingCommissions.length} comissão(ões) aguardando pagamento.`,
      severity: "alerta",
      dedupKey: `comissoes_pendentes:${pendingCommissions.length}`,
      link: "/app/comissoes",
    });
  }

  /* --------------------------- auditoria inicial --------------------------- */
  const auditEntries = [
    { action: "criou", module: "Organização", summary: 'Organização "Barbearia Navalha de Ouro" criada' },
    { action: "atualizou", module: "Configurações", summary: "Horário de funcionamento configurado" },
    { action: "criou", module: "Serviços", summary: "Catálogo inicial de serviços cadastrado" },
    { action: "criou", module: "Caixa", summary: "Caixa aberto para operação do dia" },
  ];
  for (const e of auditEntries) {
    await ctx.db.insert("auditLogs", {
      organizationId,
      userId: responsible,
      userName: "Owner",
      ...e,
      createdAt: now,
    });
  }

  await ctx.db.patch(organizationId, {
    salesCount: saleNumber,
    onboardingStep: undefined,
    isDemo: true,
    updatedAt: now,
  });
}