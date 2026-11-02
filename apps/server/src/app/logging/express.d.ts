declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      /**
       * Set by `OptionalJwtAuthGuard`. True when the request carried no credential,
       * so the response must be the public one. Defaults to `true` in the controller
       * path that reads it, so a request that never reached the guard is treated as
       * public rather than as staff.
       */
      isPublic?: boolean;
    }
  }
}

export {};
