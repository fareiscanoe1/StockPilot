import { PrismaClient, StrategyMode, SubPortfolioType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@earningspilot.ai";
  const password = await bcrypt.hash("demo-demo-demo", 10);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Demo Pilot",
      passwordHash: password,
    },
    update: { passwordHash: password },
  });

  await prisma.strategyProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, mode: StrategyMode.BALANCED, riskParams: {} },
    update: {},
  });

  await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  });

  await prisma.watchlist.upsert({
    where: { userId_name: { userId: user.id, name: "Core" } },
    create: {
      userId: user.id,
      name: "Core",
      symbols: {
        create: [
          { symbol: "AAPL", exchange: "US" },
          { symbol: "MSFT", exchange: "US" },
          { symbol: "NVDA", exchange: "US" },
          { symbol: "SHOP", exchange: "US" },
          { symbol: "SHOP.TO", exchange: "CA" },
        ],
      },
    },
    update: {},
  });

  await prisma.virtualAccount.deleteMany({ where: { userId: user.id } });
  await prisma.virtualAccount.createMany({
    data: [
      {
        userId: user.id,
        name: "Long-term sandbox",
        subPortfolio: SubPortfolioType.LONG_TERM,
        startingCash: new Decimal(100_000),
        cashBalance: new Decimal(100_000),
      },
      {
        userId: user.id,
        name: "Swing desk",
        subPortfolio: SubPortfolioType.SWING,
        startingCash: new Decimal(50_000),
        cashBalance: new Decimal(50_000),
      },
      {
        userId: user.id,
        name: "Earnings pod",
        subPortfolio: SubPortfolioType.EARNINGS,
        startingCash: new Decimal(25_000),
        cashBalance: new Decimal(25_000),
      },
      {
        userId: user.id,
        name: "Options pod",
        subPortfolio: SubPortfolioType.OPTIONS,
        startingCash: new Decimal(25_000),
        cashBalance: new Decimal(25_000),
      },
    ],
  });

  await prisma.earningsEvent.deleteMany({
    where: { dataSource: "SEED_DEMO", symbol: { in: ["NVDA", "SHOP.TO"] } },
  });
  await prisma.earningsEvent.createMany({
    data: [
      {
        symbol: "NVDA",
        exchange: "US",
        companyName: "NVIDIA Corp",
        datetimeUtc: new Date(Date.now() + 3 * 86400000),
        dataSource: "SEED_DEMO",
        epsEstimate: new Decimal(1.9),
      },
      {
        symbol: "SHOP.TO",
        exchange: "CA",
        companyName: "Shopify Inc.",
        datetimeUtc: new Date(Date.now() + 6 * 86400000),
        dataSource: "SEED_DEMO",
        epsEstimate: new Decimal(0.35),
      },
    ],
  });

  console.log("Seed OK — demo login:", email, "/ password: demo-demo-demo");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
