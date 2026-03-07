import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Help-me API',
      version: '1.2.1',
      description: 'API de Helpdesk',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Help-me API',
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

const spec = swaggerJsdoc(options) as Record<string, any>;

// Remove a seção schemas
if (spec.components?.schemas) {
  delete spec.components.schemas;
}

export const swaggerSpec = spec;