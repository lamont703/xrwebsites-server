module.exports = {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'type-enum': [
            2,
            'always',
            [
                'feat',     // New feature
                'fix',      // Bug fix
                'docs',     // Documentation
                'style',    // Formatting
                'refactor', // Code restructuring
                'test',     // Testing
                'chore',    // Maintenance
                'perf',     // Performance
                'ci',       // CI/CD
                'build',    // Build
                'revert'    // Revert changes
            ]
        ],
        'scope-case': [0],
        'subject-case': [0]
    }
}; 