import { CosmosClient, Container, Database } from '@azure/cosmos';
import dotenv from 'dotenv';

dotenv.config();

interface Tenant {
    id: string;
    name: string;
    status: 'active' | 'suspended' | 'inactive';
    tier: 'basic' | 'professional' | 'enterprise';
    settings: {
        maxUsers: number;
        maxJobs: number;
        maxStorage: number;
        customDomain: boolean;
        analyticsEnabled: boolean;
    };
}

async function testMultiTenancy() {
    try {
        console.log('Starting multi-tenancy tests...');

        const client = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT!,
            key: process.env.COSMOS_DB_KEY!
        });

        const { database } = await client.databases.createIfNotExists({
            id: 'XRWebsites'
        });

        // Ensure all required containers exist
        const containers = {
            tenants: await ensureContainer(database, 'tenants'),
            users: await ensureContainer(database, 'users'),
            jobs: await ensureContainer(database, 'jobs'),
            analytics: await ensureContainer(database, 'analytics')
        };

        // 1. Create test tenant
        const testTenant: Tenant = {
            id: `tenant_${Date.now()}`,
            name: 'Test Organization',
            status: 'active',
            tier: 'professional',
            settings: {
                maxUsers: 10,
                maxJobs: 100,
                maxStorage: 5000,
                customDomain: true,
                analyticsEnabled: true
            }
        };

        const { resource: createdTenant } = await containers.tenants.items.create(testTenant);
        console.log('✓ Created test tenant:', createdTenant.id);

        // 2. Create user in tenant
        const testUser = {
            id: `user_${Date.now()}`,
            tenantId: createdTenant.id,
            email: 'test@testorg.com',
            roles: ['user'],
            status: 'active'
        };

        const { resource: createdUser } = await containers.users.items.create(testUser);
        console.log('✓ Created test user in tenant:', createdUser.id);

        // 3. Create job for tenant
        const testJob = {
            id: `job_${Date.now()}`,
            tenantId: createdTenant.id,
            creatorId: createdUser.id,
            title: 'Test Tenant Job',
            status: 'active'
        };

        const { resource: createdJob } = await containers.jobs.items.create(testJob);
        console.log('✓ Created test job for tenant:', createdJob.id);

        // 4. Create analytics entry for tenant
        const testAnalytics = {
            id: `analytics_${Date.now()}`,
            tenantId: createdTenant.id,
            type: 'job_metrics',
            data: {
                metrics: {
                    activeJobs: 1,
                    totalUsers: 1
                }
            },
            timestamp: new Date().toISOString(),
            period: 'daily'
        };

        const { resource: createdAnalytics } = await containers.analytics.items.create(testAnalytics);
        console.log('✓ Created analytics entry for tenant:', createdAnalytics.id);

        // 5. Test tenant isolation
        const query = {
            query: "SELECT * FROM c WHERE c.tenantId = @tenantId",
            parameters: [{ name: "@tenantId", value: createdTenant.id }]
        };

        const { resources: tenantJobs } = await containers.jobs.items.query(query).fetchAll();
        console.log(`✓ Found ${tenantJobs.length} jobs for tenant`);

        // Cleanup
        console.log('\nCleaning up test data...');
        await Promise.all([
            containers.tenants.item(createdTenant.id, createdTenant.id).delete(),
            containers.users.item(createdUser.id, createdUser.id).delete(),
            containers.jobs.item(createdJob.id, createdJob.id).delete(),
            containers.analytics.item(createdAnalytics.id, createdAnalytics.id).delete()
        ]);
        console.log('✓ Test data cleaned up');

    } catch (error) {
        console.error('Multi-tenancy test failed:', error);
        throw error;
    }
}

async function ensureContainer(database: Database, containerId: string) {
    const { container } = await database.containers.createIfNotExists({
        id: containerId,
        partitionKey: { paths: ["/id"] }
    });
    console.log(`✓ Ensured container ${containerId} exists`);
    return container;
}

// Run the test
testMultiTenancy().catch(console.error); 