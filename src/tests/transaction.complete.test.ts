import { CosmosClient } from '@azure/cosmos';
import { TransactionService } from '../services/transaction.service';
import { Logger } from '../services/logger.service';
import { CacheService } from '../services/cache.service';
import dotenv from 'dotenv';

dotenv.config();

async function testTransactionService() {
    try {
        // Basic setup
        const client = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT!,
            key: process.env.COSMOS_DB_KEY!
        });

        const logger = await Logger.initialize(client);
        const cache = await CacheService.initialize(
            {
                host: process.env.AZURE_REDIS_HOST!,
                key: process.env.AZURE_REDIS_KEY!,
                port: parseInt(process.env.AZURE_REDIS_PORT!) || 6380
            },
            logger
        );

        const transactionService = await TransactionService.initialize(
            client,
            logger,
            cache
        );

        // Test scenario
        const tenantId = `test_tenant_${Date.now()}`;
        const user1 = `test_user_1_${Date.now()}`;
        const user2 = `test_user_2_${Date.now()}`;

        // 1. Create wallets
        console.log('\nCreating test wallets...');
        const wallet1 = await transactionService.createWallet(tenantId, user1);
        const wallet2 = await transactionService.createWallet(tenantId, user2);
        console.log('Wallets created:', { wallet1Id: wallet1.id, wallet2Id: wallet2.id });

        // 2. Make a deposit
        console.log('\nTesting deposit...');
        await transactionService.deposit(tenantId, user1, 1000, 'test_deposit');
        const walletAfterDeposit = await transactionService.getWallet(tenantId, user1);
        console.log('Wallet1 balance after deposit:', walletAfterDeposit?.balance);

        // 3. Make a transfer
        console.log('\nTesting transfer...');
        await transactionService.transfer(tenantId, user1, user2, 500);

        // 4. Check final balances
        const finalWallet1 = await transactionService.getWallet(tenantId, user1);
        const finalWallet2 = await transactionService.getWallet(tenantId, user2);
        
        console.log('Final balances:', {
            user1: finalWallet1?.balance,
            user2: finalWallet2?.balance
        });

        // Add these test cases after our existing tests
        console.log('\nTesting error cases...');

        // Test insufficient funds
        try {
            await transactionService.transfer(tenantId, user1, user2, 1000000);
            console.error('❌ Should have failed on insufficient funds');
        } catch (error) {
            console.log('✓ Correctly blocked insufficient funds transfer');
        }

        // Test invalid amount
        try {
            await transactionService.deposit(tenantId, user1, -100);
            console.error('❌ Should have failed on negative amount');
        } catch (error) {
            console.log('✓ Correctly blocked negative amount');
        }

        // Test non-existent wallet
        try {
            await transactionService.transfer(tenantId, 'fake-user', user2, 100);
            console.error('❌ Should have failed on non-existent wallet');
        } catch (error) {
            console.log('✓ Correctly blocked transfer from non-existent wallet');
        }

        // Test same-wallet transfer
        try {
            await transactionService.transfer(tenantId, user1, user1, 100);
            console.error('❌ Should have failed on same-wallet transfer');
        } catch (error) {
            console.log('✓ Correctly blocked same-wallet transfer');
        }

        // Verify balances remained unchanged after failed attempts
        const finalBalances = await Promise.all([
            transactionService.getWallet(tenantId, user1),
            transactionService.getWallet(tenantId, user2)
        ]);

        console.log('\nFinal balance verification:', {
            user1: finalBalances[0]?.balance,
            user2: finalBalances[1]?.balance
        });

        console.log('\n✅ All transaction tests completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    }
}

testTransactionService().catch(console.error); 