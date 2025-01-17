import { bold } from "./bold";

describe("bold font", () => {
    it("should bold", () => {
        expect(bold("kevin")).toBe("𝐤𝐞𝐯𝐢𝐧");
        expect(bold("123\nasdf")).toBe("𝟏𝟐𝟑\n𝐚𝐬𝐝𝐟");
    });
});
