import {
  SimulatedAction,
  OrderSide,
  OrderStatus,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import prisma from "@/lib/db";
import type { StrategyCandidate } from "./strategy-engine";

export interface ExecuteSimulatedTradeInput {
  virtualAccountId: string;
  candidate: StrategyCandidate;
  quantity: number;
  fillPrice: number;
  action: SimulatedAction;
}

/** Updates cash, holdings, orders, fills — never touches a real broker. */
export class PortfolioSimulator {
  static async portfolioValue(
    virtualAccountId: string,
    markPrices: Record<string, number>,
  ): Promise<number> {
    const acc = await prisma.virtualAccount.findUnique({
      where: { id: virtualAccountId },
      include: { holdings: true },
    });
    if (!acc) return 0;
    let equities = 0;
    for (const h of acc.holdings) {
      const px = markPrices[h.symbol] ?? Number(h.avgCost);
      equities += Number(h.quantity) * px;
    }
    return Number(acc.cashBalance) + equities;
  }

  static async execute(input: ExecuteSimulatedTradeInput) {
    const { virtualAccountId, candidate, quantity, fillPrice, action } = input;

    return prisma.$transaction(async (tx) => {
      const account = await tx.virtualAccount.findUniqueOrThrow({
        where: { id: virtualAccountId },
      });
      const side =
        action === SimulatedAction.SELL ||
        action === SimulatedAction.TRIM ||
        action === SimulatedAction.CLOSE
          ? OrderSide.SELL
          : OrderSide.BUY;

      const order = await tx.simulatedOrder.create({
        data: {
          virtualAccountId,
          symbol: candidate.symbol,
          assetType: candidate.assetType,
          action,
          side,
          quantity: new Decimal(quantity),
          limitPrice: new Decimal(fillPrice),
          status: OrderStatus.FILLED,
          strategyTag: candidate.strategyTag,
          isEarningsPlay: candidate.isEarningsPlay,
          clientNote: `[SIMULATION ONLY] ${candidate.thesis}`.slice(0, 2000),
        },
      });

      const notional = quantity * fillPrice;
      const fee = Math.min(5, notional * 0.0005);

      await tx.simulatedFill.create({
        data: {
          virtualAccountId,
          orderId: order.id,
          price: new Decimal(fillPrice),
          quantity: new Decimal(quantity),
          fees: new Decimal(fee),
        },
      });

      const cash = Number(account.cashBalance);
      const delta =
        side === OrderSide.BUY ? -(notional + fee) : notional - fee;
      const newCash = cash + delta;

      const holding = await tx.holding.findFirst({
        where: { virtualAccountId, symbol: candidate.symbol, assetType: candidate.assetType },
      });

      if (side === OrderSide.BUY) {
        if (holding) {
          const q0 = Number(holding.quantity);
          const c0 = Number(holding.avgCost);
          const q1 = q0 + quantity;
          const avg = (q0 * c0 + quantity * fillPrice) / q1;
          await tx.holding.update({
            where: { id: holding.id },
            data: {
              quantity: new Decimal(q1),
              avgCost: new Decimal(avg),
            },
          });
        } else {
          await tx.holding.create({
            data: {
              virtualAccountId,
              symbol: candidate.symbol,
              assetType: candidate.assetType,
              quantity: new Decimal(quantity),
              avgCost: new Decimal(fillPrice),
              sector: "UNKNOWN",
            },
          });
        }
      } else {
        if (holding) {
          const q0 = Number(holding.quantity);
          const q1 = Math.max(0, q0 - quantity);
          if (q1 < 1e-8) {
            await tx.holding.delete({ where: { id: holding.id } });
          } else {
            await tx.holding.update({
              where: { id: holding.id },
              data: { quantity: new Decimal(q1) },
            });
          }
        }
      }

      await tx.virtualAccount.update({
        where: { id: virtualAccountId },
        data: { cashBalance: new Decimal(newCash) },
      });

      return order;
    });
  }
}
