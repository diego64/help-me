export class UsuarioError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'UsuarioError';
  }
}