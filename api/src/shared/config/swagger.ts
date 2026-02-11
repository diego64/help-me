import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Help-me API',
      version: '1.1.1',
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

export const swaggerSpec = swaggerJsdoc(options);