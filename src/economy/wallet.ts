// ============================================================
// Wallet Service — manages agent wallets and credit transactions
// ============================================================

import { eq, and, sql, desc, count } from 'drizzle-orm';
import { db } from '../config/database.js';
import { wallets, transactions, activityLog } from '../db/schema.js';
import { createLogger } from '../shared/logger.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import type { Wallet, Transaction } from '../shared/types.js';

const log = createLogger('economy:wallet');

// ============================================================
// WalletService
// ============================================================

export class WalletService {
  // ----------------------------------------------------------
  // Create a wallet for a new agent
  // ----------------------------------------------------------

  async createWallet(agentId: string, initialBalance?: number): Promise<Wallet> {
    const balance = initialBalance ?? 0;

    const [wallet] = await db
      .insert(wallets)
      .values({
        agentId,
        balance: balance.toFixed(2),
        totalEarned: balance > 0 ? balance.toFixed(2) : '0.00',
        totalSpent: '0.00',
      })
      .returning();

    log.info(
      { agentId, initialBalance: balance },
      'Wallet created',
    );

    // Log initial bonus transaction if there's an initial balance
    if (balance > 0) {
      await db.insert(transactions).values({
        walletId: wallet.id,
        type: 'bonus',
        amount: balance.toFixed(2),
        balanceAfter: balance.toFixed(2),
        description: 'Initial hiring bonus',
        referenceType: 'agent',
        referenceId: agentId,
      });
    }

    await db.insert(activityLog).values({
      actor: 'system',
      action: 'wallet_created',
      entityType: 'wallet',
      entityId: wallet.id,
      details: { agentId, initialBalance: balance },
    });

    return wallet;
  }

  // ----------------------------------------------------------
  // Get wallet by agent ID
  // ----------------------------------------------------------

  async getWallet(agentId: string): Promise<Wallet | null> {
    const [wallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.agentId, agentId))
      .limit(1);

    return wallet ?? null;
  }

  // ----------------------------------------------------------
  // Credit (add) to an agent's wallet
  // ----------------------------------------------------------

  async credit(
    agentId: string,
    amount: number,
    type: string,
    description: string,
    referenceType?: string,
    referenceId?: string,
  ): Promise<Transaction> {
    if (amount <= 0) {
      throw new ValidationError('Credit amount must be positive');
    }

    const wallet = await this.getWallet(agentId);
    if (!wallet) {
      throw new NotFoundError('Wallet for agent', agentId);
    }

    const currentBalance = parseFloat(wallet.balance ?? '0');
    const newBalance = currentBalance + amount;

    // Atomic: update wallet balance + total_earned, then create transaction
    const [updatedWallet] = await db
      .update(wallets)
      .set({
        balance: newBalance.toFixed(2),
        totalEarned: sql`${wallets.totalEarned}::numeric + ${amount.toFixed(2)}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.agentId, agentId))
      .returning();

    const [transaction] = await db
      .insert(transactions)
      .values({
        walletId: updatedWallet.id,
        type,
        amount: amount.toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        description,
        referenceType: referenceType ?? null,
        referenceId: referenceId ?? null,
      })
      .returning();

    await db.insert(activityLog).values({
      actor: 'system',
      action: 'wallet_credit',
      entityType: 'wallet',
      entityId: updatedWallet.id,
      details: {
        agentId,
        amount,
        type,
        description,
        balanceAfter: newBalance,
      },
    });

    log.debug(
      { agentId, amount, type, balanceAfter: newBalance },
      'Wallet credited',
    );

    return transaction;
  }

  // ----------------------------------------------------------
  // Debit (subtract) from an agent's wallet
  // ----------------------------------------------------------

  async debit(
    agentId: string,
    amount: number,
    type: string,
    description: string,
    referenceType?: string,
    referenceId?: string,
  ): Promise<Transaction> {
    if (amount <= 0) {
      throw new ValidationError('Debit amount must be positive');
    }

    const wallet = await this.getWallet(agentId);
    if (!wallet) {
      throw new NotFoundError('Wallet for agent', agentId);
    }

    const currentBalance = parseFloat(wallet.balance ?? '0');
    const newBalance = currentBalance - amount;

    // Update wallet balance + total_spent
    const [updatedWallet] = await db
      .update(wallets)
      .set({
        balance: newBalance.toFixed(2),
        totalSpent: sql`${wallets.totalSpent}::numeric + ${amount.toFixed(2)}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.agentId, agentId))
      .returning();

    const [transaction] = await db
      .insert(transactions)
      .values({
        walletId: updatedWallet.id,
        type,
        amount: (-amount).toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        description,
        referenceType: referenceType ?? null,
        referenceId: referenceId ?? null,
      })
      .returning();

    await db.insert(activityLog).values({
      actor: 'system',
      action: 'wallet_debit',
      entityType: 'wallet',
      entityId: updatedWallet.id,
      details: {
        agentId,
        amount,
        type,
        description,
        balanceAfter: newBalance,
      },
    });

    log.debug(
      { agentId, amount, type, balanceAfter: newBalance },
      'Wallet debited',
    );

    return transaction;
  }

  // ----------------------------------------------------------
  // Transfer between two wallets
  // ----------------------------------------------------------

  async transfer(
    fromAgentId: string,
    toAgentId: string,
    amount: number,
    description: string,
  ): Promise<{ debit: Transaction; credit: Transaction }> {
    if (amount <= 0) {
      throw new ValidationError('Transfer amount must be positive');
    }

    if (fromAgentId === toAgentId) {
      throw new ValidationError('Cannot transfer to the same wallet');
    }

    const fromWallet = await this.getWallet(fromAgentId);
    if (!fromWallet) {
      throw new NotFoundError('Wallet for agent', fromAgentId);
    }

    const toWallet = await this.getWallet(toAgentId);
    if (!toWallet) {
      throw new NotFoundError('Wallet for agent', toAgentId);
    }

    const debitTx = await this.debit(
      fromAgentId,
      amount,
      'transfer',
      `Transfer to agent: ${description}`,
      'agent',
      toAgentId,
    );

    const creditTx = await this.credit(
      toAgentId,
      amount,
      'transfer',
      `Transfer from agent: ${description}`,
      'agent',
      fromAgentId,
    );

    log.info(
      { fromAgentId, toAgentId, amount },
      'Wallet transfer completed',
    );

    return { debit: debitTx, credit: creditTx };
  }

  // ----------------------------------------------------------
  // Get current balance
  // ----------------------------------------------------------

  async getBalance(agentId: string): Promise<number> {
    const wallet = await this.getWallet(agentId);
    if (!wallet) {
      throw new NotFoundError('Wallet for agent', agentId);
    }

    return parseFloat(wallet.balance ?? '0');
  }

  // ----------------------------------------------------------
  // Get transaction history for an agent
  // ----------------------------------------------------------

  async getTransactions(
    agentId: string,
    options?: {
      type?: string;
      since?: Date;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ transactions: Transaction[]; total: number }> {
    const wallet = await this.getWallet(agentId);
    if (!wallet) {
      throw new NotFoundError('Wallet for agent', agentId);
    }

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    // Build conditions
    const conditions = [eq(transactions.walletId, wallet.id)];

    if (options?.type) {
      conditions.push(eq(transactions.type, options.type));
    }

    if (options?.since) {
      conditions.push(
        sql`${transactions.createdAt} >= ${options.since.toISOString()}`,
      );
    }

    const whereClause = conditions.length === 1
      ? conditions[0]
      : and(...conditions);

    // Get total count
    const [{ value: total }] = await db
      .select({ value: count() })
      .from(transactions)
      .where(whereClause);

    // Get paginated transactions
    const txList = await db
      .select()
      .from(transactions)
      .where(whereClause)
      .orderBy(desc(transactions.createdAt))
      .limit(limit)
      .offset(offset);

    return { transactions: txList, total };
  }

  // ----------------------------------------------------------
  // Get all wallets (for overview)
  // ----------------------------------------------------------

  async getAllWallets(): Promise<Wallet[]> {
    return db.select().from(wallets);
  }

  // ----------------------------------------------------------
  // Archive wallet (zero out, called when agent is fired)
  // ----------------------------------------------------------

  async archiveWallet(agentId: string): Promise<void> {
    const wallet = await this.getWallet(agentId);
    if (!wallet) {
      log.warn({ agentId }, 'No wallet found to archive');
      return;
    }

    const currentBalance = parseFloat(wallet.balance ?? '0');

    if (currentBalance !== 0) {
      // Create a final zeroing transaction
      await db.insert(transactions).values({
        walletId: wallet.id,
        type: 'expense',
        amount: (-currentBalance).toFixed(2),
        balanceAfter: '0.00',
        description: 'Wallet archived — agent terminated',
        referenceType: 'agent',
        referenceId: agentId,
      });
    }

    // Zero out the wallet
    await db
      .update(wallets)
      .set({
        balance: '0.00',
        updatedAt: new Date(),
      })
      .where(eq(wallets.agentId, agentId));

    await db.insert(activityLog).values({
      actor: 'system',
      action: 'wallet_archived',
      entityType: 'wallet',
      entityId: wallet.id,
      details: {
        agentId,
        previousBalance: currentBalance,
      },
    });

    log.info(
      { agentId, previousBalance: currentBalance },
      'Wallet archived',
    );
  }
}

// ============================================================
// Singleton instance
// ============================================================

export const walletService = new WalletService();
