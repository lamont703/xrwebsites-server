export const IndexingPolicies = {
    // Base policy that all collections inherit from
    base: {
        indexingMode: "consistent",
        automatic: true,
        includedPaths: [
            {
                path: "/*",
                indexes: [
                    {
                        kind: "Range",
                        dataType: "String",
                        precision: -1
                    }
                ]
            },
            {
                path: "/tenantId/?",
                indexes: [
                    {
                        kind: "Range",
                        dataType: "String",
                        precision: -1
                    }
                ]
            },
            {
                path: "/createdAt/?",
                indexes: [
                    {
                        kind: "Range",
                        dataType: "String",
                        precision: -1
                    }
                ]
            },
            {
                path: "/updatedAt/?",
                indexes: [
                    {
                        kind: "Range",
                        dataType: "String",
                        precision: -1
                    }
                ]
            }
        ],
        excludedPaths: [
            {
                path: "/_etag/?"
            },
            {
                path: "/metadata/*"
            }
        ]
    },

    // Collection-specific policies
    collections: {
        users: {
            includedPaths: [
                {
                    path: "/email/?",
                    indexes: [
                        {
                            kind: "Hash",
                            dataType: "String",
                            precision: -1
                        }
                    ]
                },
                {
                    path: "/username/?",
                    indexes: [
                        {
                            kind: "Hash",
                            dataType: "String",
                            precision: -1
                        }
                    ]
                },
                {
                    path: "/role/?",
                    indexes: [
                        {
                            kind: "Hash",
                            dataType: "String",
                            precision: 3
                        }
                    ]
                },
                {
                    path: "/permissions/*",
                    indexes: [
                        {
                            kind: "Hash",
                            dataType: "String",
                            precision: 3
                        }
                    ]
                }
            ],
            compositeIndexes: [
                [
                    { path: "/tenantId", order: "ascending" },
                    { path: "/role", order: "ascending" }
                ],
                [
                    { path: "/tenantId", order: "ascending" },
                    { path: "/email", order: "ascending" }
                ]
            ]
        },

        transactions: {
            includedPaths: [
                {
                    path: "/type/?",
                    indexes: [
                        {
                            kind: "Hash",
                            dataType: "String",
                            precision: 3
                        }
                    ]
                },
                {
                    path: "/status/?",
                    indexes: [
                        {
                            kind: "Hash",
                            dataType: "String",
                            precision: 3
                        }
                    ]
                },
                {
                    path: "/amount/?",
                    indexes: [
                        {
                            kind: "Range",
                            dataType: "Number",
                            precision: -1
                        }
                    ]
                },
                {
                    path: "/from/userId/?",
                    indexes: [
                        {
                            kind: "Hash",
                            dataType: "String",
                            precision: -1
                        }
                    ]
                },
                {
                    path: "/to/userId/?",
                    indexes: [
                        {
                            kind: "Hash",
                            dataType: "String",
                            precision: -1
                        }
                    ]
                }
            ],
            compositeIndexes: [
                [
                    { path: "/tenantId", order: "ascending" },
                    { path: "/createdAt", order: "descending" }
                ],
                [
                    { path: "/tenantId", order: "ascending" },
                    { path: "/type", order: "ascending" },
                    { path: "/amount", order: "descending" }
                ]
            ]
        },

        wallets: {
            includedPaths: [
                {
                    path: "/userId/?",
                    indexes: [
                        {
                            kind: "Hash",
                            dataType: "String",
                            precision: -1
                        }
                    ]
                },
                {
                    path: "/balance/?",
                    indexes: [
                        {
                            kind: "Range",
                            dataType: "Number",
                            precision: -1
                        }
                    ]
                },
                {
                    path: "/status/?",
                    indexes: [
                        {
                            kind: "Hash",
                            dataType: "String",
                            precision: 3
                        }
                    ]
                }
            ],
            compositeIndexes: [
                [
                    { path: "/tenantId", order: "ascending" },
                    { path: "/balance", order: "descending" }
                ],
                [
                    { path: "/tenantId", order: "ascending" },
                    { path: "/status", order: "ascending" }
                ]
            ]
        }
    }
};

// Helper function to merge base policy with collection-specific policy
export function getIndexingPolicy(collectionName: string) {
    const collectionPolicy = IndexingPolicies.collections[collectionName];
    return {
        indexingMode: IndexingPolicies.base.indexingMode,
        automatic: IndexingPolicies.base.automatic,
        includedPaths: [
            ...IndexingPolicies.base.includedPaths,
            ...collectionPolicy.includedPaths
        ],
        excludedPaths: IndexingPolicies.base.excludedPaths,
        compositeIndexes: collectionPolicy.compositeIndexes
    };
} 