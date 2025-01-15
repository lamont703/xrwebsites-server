const Joi = require('joi');

const envSchema = Joi.object({
    NODE_ENV: Joi.string()
        .valid('development', 'production', 'test')
        .default('development'),
    PORT: Joi.number().default(5500),
    API_URL: Joi.string().required(),
    
    COSMOS_DB_ENDPOINT: Joi.string().required(),
    COSMOS_DB_KEY: Joi.string().required(),
    COSMOS_DB_DATABASE: Joi.string().required(),
    COSMOS_DB_CONTAINER: Joi.string().required(),
    
    JWT_SECRET: Joi.string().required().min(32),
    JWT_EXPIRES_IN: Joi.string().required(),
    
    SOLANA_RPC_URL: Joi.string().required(),
    SOLANA_NETWORK: Joi.string().required(),
    
    CORS_ORIGIN: Joi.string().required(),
    RATE_LIMIT_WINDOW_MS: Joi.number(),
    RATE_LIMIT_MAX: Joi.number(),
    BCRYPT_SALT_ROUNDS: Joi.number()
}).unknown();

const validateEnv = () => {
    const { error, value } = envSchema.validate(process.env);
    if (error) {
        throw new Error(`Environment validation error: ${error.message}`);
    }
    return value;
};

module.exports = validateEnv; 