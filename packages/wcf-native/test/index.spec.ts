import { sum } from '../index.js'

describe("wcf-native", () => {
    it('sum from native', async () => {
        expect(sum(1, 2)).toBe(3);
    });
})

