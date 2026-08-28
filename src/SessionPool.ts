import {Pool} from 'tarn';
import {FileMakerError, type FileMakerErrorResponse} from './FileMakerError';

/**
 * A FileMaker Data API session checked out of the pool.
 *
 * `lastUsedAt` mirrors FileMaker's own idle timer: the server expires a session 15 minutes after the
 * last request it answered, so the timestamp is refreshed on every completed response rather than on
 * creation alone.
 */
export type PooledSession = {
    token: string;
    lastUsedAt: number;
    invalid: boolean;
};

export type SessionPoolOptions = {
    /**
     * Minimum number of sessions to keep. Defaults to 0, and should stay there: tarn keeps `min`
     * resources alive past `idleTimeoutMillis`, so a non-zero value both holds FileMaker sessions
     * open needlessly and keeps the reaping timer alive for the lifetime of the process.
     */
    min?: number;
    /**
     * Maximum number of concurrent sessions. Defaults to 5. Each session is a real FileMaker Server
     * connection, so this is the ceiling on how much Data API concurrency one client can use.
     */
    max?: number;
    /** How long to wait for a free session before rejecting. Defaults to 30 seconds. */
    acquireTimeoutMillis?: number;
    /** How long a sign-in may take before it is abandoned. Defaults to 30 seconds. */
    createTimeoutMillis?: number;
    /** How long a sign-out may take before the session is dropped anyway. Defaults to 5 seconds. */
    destroyTimeoutMillis?: number;
    /**
     * How long an unused session is kept before it is signed out. Defaults to 13 minutes, which
     * releases it on the server shortly before FileMaker's own 15 minute expiry.
     */
    idleTimeoutMillis?: number;
    /** How often to look for idle sessions. Defaults to 30 seconds. */
    reapIntervalMillis?: number;
    /** How long to wait after a failed sign-in before trying again. Defaults to 200 milliseconds. */
    createRetryIntervalMillis?: number;
    /**
     * Whether a failed sign-in rejects the waiting caller immediately. Defaults to `true`, which
     * differs from the pool implementation's own default on purpose: with `false`, bad credentials
     * are retried silently until `acquireTimeoutMillis` elapses and then surface as a `TimeoutError`,
     * losing the FileMaker error code that explains what actually went wrong. Set it to `false` only
     * if you would rather ride out a restarting server than see the error.
     */
    propagateCreateError?: boolean;
    /** Receives the pool's internal warnings. */
    log?: (message: string) => void;
};

/**
 * How long a session may sit unused before we stop trusting its token. FileMaker expires a session
 * 15 minutes after its last request; we retire ours a minute early to avoid racing that.
 */
const SESSION_TTL_MILLIS = 14 * 60 * 1000;

export class SessionPool {
    private readonly pool: Pool<PooledSession>;
    private destroyed: boolean = false;

    public constructor(
        private readonly uri: string,
        private readonly database: string,
        private readonly username: string,
        private readonly password: string,
        options: SessionPoolOptions = {},
    ) {
        this.pool = new Pool<PooledSession>({
            create: async () => this.signIn(),
            validate: session => this.isUsable(session),
            destroy: async session => this.signOut(session),
            min: options.min ?? 0,
            max: options.max ?? 5,
            acquireTimeoutMillis: options.acquireTimeoutMillis ?? 30 * 1000,
            createTimeoutMillis: options.createTimeoutMillis ?? 30 * 1000,
            destroyTimeoutMillis: options.destroyTimeoutMillis ?? 5 * 1000,
            idleTimeoutMillis: options.idleTimeoutMillis ?? 13 * 60 * 1000,
            reapIntervalMillis: options.reapIntervalMillis ?? 30 * 1000,
            createRetryIntervalMillis: options.createRetryIntervalMillis ?? 200,
            propagateCreateError: options.propagateCreateError ?? true,
            log: options.log ?? (() => undefined),
        });

        // Without this, a single request keeps the process alive for up to idleTimeoutMillis, because
        // the reaping interval is not unref'd. That interval is assigned *after* the startReaping
        // handlers run, hence the setImmediate. Reaching for a protected field is deliberate and
        // deliberately defensive: if a future release renames it, the pool still works, callers just
        // have to rely on destroy() to let the process exit.
        this.pool.on('startReaping', () => {
            setImmediate(() => {
                const {interval} = this.pool as unknown as {interval: {unref?: () => void} | null};
                interval?.unref?.();
            });
        });
    }

    public async acquire(): Promise<PooledSession> {
        if (this.destroyed) {
            throw new Error('Client has been destroyed');
        }

        return this.pool.acquire().promise;
    }

    public release(session: PooledSession): void {
        this.pool.release(session);
    }

    /**
     * Signs out every session and closes the pool, waiting for sessions that are currently checked
     * out to be released first. The pool cannot be used afterwards.
     */
    public async destroy(): Promise<void> {
        if (this.destroyed) {
            return;
        }

        this.destroyed = true;
        await this.pool.destroy();
    }

    private isUsable(session: PooledSession): boolean {
        if (session.invalid) {
            return false;
        }

        // Math.abs mirrors how the pool measures idle time, so that a clock stepping backwards (NTP,
        // a machine waking from sleep) retires the session instead of extending its life.
        return Math.abs(Date.now() - session.lastUsedAt) < SESSION_TTL_MILLIS;
    }

    private async signIn(): Promise<PooledSession> {
        const response = await fetch(`${this.uri}/fmi/data/v1/databases/${this.database}/sessions`, {
            method: 'POST',
            body: '{}',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
            },
        });

        if (!response.ok) {
            const data = (await response.json()) as FileMakerErrorResponse;
            throw new FileMakerError(data.messages[0].code, data.messages[0].message);
        }

        const token = response.headers.get('X-FM-Data-Access-Token');

        if (!token) {
            throw new Error('Could not get token');
        }

        // Must be stamped here: the pool validates a resource on the very first acquire, including
        // the one that just created it, so a session starting at 0 would look expired on sight and
        // the pool would sign in and out in a loop until the acquire timed out.
        return {token, lastUsedAt: Date.now(), invalid: false};
    }

    private async signOut(session: PooledSession): Promise<void> {
        // This must never reject. When a sign-in overruns createTimeoutMillis and then succeeds
        // anyway, the pool calls the destroyer directly without awaiting or catching it, so a
        // rejection here becomes an unhandled rejection and takes the process down on Node 22.
        try {
            await fetch(`${this.uri}/fmi/data/v1/databases/${this.database}/sessions/${session.token}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        } catch {
            // A session the server has already expired cannot be signed out, and that is fine.
        }
    }
}
