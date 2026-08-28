export class FileMakerError extends Error {
    public readonly code: string;

    public constructor(code: string, message: string) {
        super(message);
        this.code = code;
    }
}

export type FileMakerErrorResponse = {
    messages: Array<{
        code: string;
        message: string;
    }>;
};

export type FileMakerResponse<T> = {
    response: T;
};
