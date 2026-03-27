import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Help-me Auth Service',
      version: '1',
      description: 'API de Autenticação, Autorização e RBAC',
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3333}/auth`,
        description: 'Auth Service',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/presentation/http/routes/**/*.ts'],
};

const spec = swaggerJsdoc(options) as Record<string, unknown>;

// Remove a seção schemas
if (spec.components && typeof spec.components === 'object') {
  const components = spec.components as Record<string, unknown>;
  if (components['schemas']) {
    delete components['schemas'];
  }
}

export const swaggerSpec = spec;