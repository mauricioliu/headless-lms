// Server-level configuration for the HTTP entry point. The package never reads
// process.env — installations build this object (typically from their .env)
// and pass it to createContainer/buildServer.
import type { Config } from '../app/container.js';

export interface ServerConfig {
  /** TCP port to listen on. */
  port: number;
  /** Bind address. */
  host: string;
  /** The API's own origin, advertised as the OpenAPI server URL. */
  publicUrl: string;
  /** Browser app origins allowed by CORS. */
  clientOrigins: string[];
  /** Presigned URL lifetime for entitled download delivery, seconds. Separate
   *  from the storage adapter's general download expiry so raising that one
   *  can't silently extend paywalled link lifetimes. */
  deliveryExpirySeconds: number;
  /** Everything the composition container needs to wire adapters + services. */
  container: Config;
}
