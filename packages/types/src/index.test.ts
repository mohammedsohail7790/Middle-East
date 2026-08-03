
// Test type declarations
declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void): void;
declare function expect(value: any): any;


// vitest - test framework handled separately

describe('Gravity Types', () => {
    it('should pass a basic test', () => {
        expect(true).toBe(true);
    });

    it('should have valid environment variables', () => {
        expect(process.env.NODE_ENV).toBeDefined();
    });
});
