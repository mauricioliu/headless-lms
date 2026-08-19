export class InvalidAttemptAnswersError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAttemptAnswersError';
  }
}
