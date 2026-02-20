export interface CurrentUserPayload {
    id: string;
    email: string;
    type: 'B2C' | 'B2B';
    isActive: boolean;
}
export declare const CurrentUser: (...dataOrPipes: unknown[]) => ParameterDecorator;
