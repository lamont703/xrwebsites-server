import { CosmosClient, Container, Database } from '@azure/cosmos';
import dotenv from 'dotenv';

dotenv.config();

interface Role {
    id: string;
    name: string;
    permissions: {
        jobs?: {
            create?: boolean;
            read?: boolean;
            update?: boolean;
            delete?: boolean;
            bid?: boolean;
        };
        assets?: {
            create?: boolean;
            read?: boolean;
            update?: boolean;
            delete?: boolean;
            sell?: boolean;
        };
        admin?: {
            accessPanel?: boolean;
            manageUsers?: boolean;
            manageContent?: boolean;
        };
    };
    level: number;
}

interface User {
    id: string;
    email: string;
    roles: string[];
    permissions: {
        canCreateJobs: boolean;
        canBidOnJobs: boolean;
        canCreateAssets: boolean;
        canSellAssets: boolean;
    };
    status: 'active' | 'inactive' | 'suspended';
    verificationLevel: 'basic' | 'verified' | 'premium';
}

async function ensureContainer(database: Database, containerId: string) {
    try {
        const { container } = await database.containers.createIfNotExists({
            id: containerId,
            partitionKey: { paths: ["/id"] }
        });
        console.log(`✓ Ensured container ${containerId} exists`);
        return container;
    } catch (error) {
        console.error(`Error creating container ${containerId}:`, error);
        throw error;
    }
}

async function testRBAC() {
    try {
        console.log('Starting RBAC tests...');

        // Initialize Cosmos DB client
        const client = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT!,
            key: process.env.COSMOS_DB_KEY!
        });

        // Ensure database exists
        const { database } = await client.databases.createIfNotExists({
            id: 'XRWebsites'
        });
        console.log('✓ Connected to database:', database.id);

        // Ensure containers exist
        const usersContainer = await ensureContainer(database, 'users');
        const rolesContainer = await ensureContainer(database, 'roles');

        // 1. Test Role Creation
        console.log('\n1. Testing role creation...');
        const developerRole: Role = {
            id: `role_${Date.now()}`,
            name: 'developer',
            permissions: {
                jobs: {
                    read: true,
                    bid: true,
                    create: false,
                    update: false,
                    delete: false
                },
                assets: {
                    read: true,
                    create: true,
                    sell: true
                }
            },
            level: 2
        };

        let createdRole;
        try {
            const { resource } = await rolesContainer.items.create(developerRole);
            createdRole = resource;
            console.log('✓ Created developer role:', createdRole.id);
        } catch (error) {
            console.error('Failed to create role:', error);
            throw error;
        }

        // 2. Test User Creation with Role
        console.log('\n2. Testing user creation...');
        const testUser: User = {
            id: `user_${Date.now()}`,
            email: 'test.developer@example.com',
            roles: [createdRole.id],
            permissions: {
                canCreateJobs: false,
                canBidOnJobs: true,
                canCreateAssets: true,
                canSellAssets: true
            },
            status: 'active',
            verificationLevel: 'verified'
        };

        let createdUser;
        try {
            const { resource } = await usersContainer.items.create(testUser);
            createdUser = resource;
            console.log('✓ Created test user:', createdUser.id);
        } catch (error) {
            console.error('Failed to create user:', error);
            throw error;
        }

        // 3. Test Permission Verification
        console.log('\n3. Testing permission verification...');
        let userWithRole, userRole;
        
        try {
            const userResponse = await usersContainer.item(createdUser.id, createdUser.id).read();
            const roleResponse = await rolesContainer.item(createdRole.id, createdRole.id).read();
            
            userWithRole = userResponse.resource;
            userRole = roleResponse.resource;

            if (!userWithRole || !userRole) {
                throw new Error('Failed to retrieve user or role data');
            }

            console.log('User data:', JSON.stringify(userWithRole, null, 2));
            console.log('Role data:', JSON.stringify(userRole, null, 2));

            const permissionCheck = {
                canBidOnJobs: userWithRole.permissions?.canBidOnJobs === userRole.permissions?.jobs?.bid,
                canCreateJobs: userWithRole.permissions?.canCreateJobs === userRole.permissions?.jobs?.create,
                canCreateAssets: userWithRole.permissions?.canCreateAssets === userRole.permissions?.assets?.create
            };

            console.log('Permission check results:', permissionCheck);
        } catch (error) {
            console.error('Permission verification failed:', error);
            throw error;
        }

        // 4. Test Role Update
        console.log('\n4. Testing role update...');
        try {
            if (!userRole?.permissions?.jobs) {
                throw new Error('Role permissions structure is invalid');
            }

            // Create a copy of the role to update
            const roleToUpdate = { ...userRole };
            roleToUpdate.permissions.jobs.bid = false;

            const { resource: updatedRole } = await rolesContainer.item(roleToUpdate.id, roleToUpdate.id).replace(roleToUpdate);
            console.log('✓ Updated role permissions:', updatedRole.permissions.jobs);

            // Verify the update
            const { resource: verifyRole } = await rolesContainer.item(roleToUpdate.id, roleToUpdate.id).read();
            console.log('Verified updated permissions:', verifyRole.permissions.jobs);
        } catch (error) {
            console.error('Role update failed:', error);
            throw error;
        }

        // 5. Test Permission Inheritance
        console.log('\n5. Testing permission inheritance...');
        try {
            const hasPermission = await checkUserPermission(usersContainer, rolesContainer, createdUser.id, 'jobs', 'bid');
            console.log('User has permission to bid:', hasPermission);
        } catch (error) {
            console.error('Permission inheritance check failed:', error);
            throw error;
        }

        // Cleanup
        console.log('\nCleaning up test data...');
        try {
            await rolesContainer.item(createdRole.id, createdRole.id).delete();
            await usersContainer.item(createdUser.id, createdUser.id).delete();
            console.log('✓ Test data cleaned up');
        } catch (error) {
            console.error('Cleanup failed:', error);
            throw error;
        }

        console.log('\nRBAC tests completed successfully!');

    } catch (error) {
        console.error('RBAC test failed:', error);
        throw error;
    }
}

async function checkUserPermission(
    usersContainer: Container,
    rolesContainer: Container,
    userId: string,
    resource: string,
    action: string
): Promise<boolean> {
    try {
        // Get user with partition key
        const { resource: user } = await usersContainer.item(userId, userId).read();
        
        if (!user) {
            console.log('User not found:', userId);
            return false;
        }

        console.log('Checking permissions for user:', {
            id: user.id,
            status: user.status,
            roles: user.roles
        });

        // If user is inactive or suspended, deny all permissions
        if (user.status !== 'active') {
            console.log('User is not active:', user.status);
            return false;
        }

        // Check each role the user has
        for (const roleId of user.roles) {
            try {
                const { resource: role } = await rolesContainer.item(roleId, roleId).read();
                
                if (!role) {
                    console.log('Role not found:', roleId);
                    continue;
                }

                console.log('Checking role:', {
                    id: role.id,
                    permissions: role.permissions?.[resource]
                });

                if (role.permissions?.[resource]?.[action]) {
                    console.log('Permission found in role:', roleId);
                    return true;
                }
            } catch (error) {
                console.error(`Error checking role ${roleId}:`, error);
                continue;
            }
        }

        console.log('No matching permissions found');
        return false;
    } catch (error) {
        console.error('Error checking user permissions:', error);
        return false;
    }
}

// Run the tests
testRBAC().catch(console.error); 