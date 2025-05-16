import { XMLParser } from "fast-xml-parser";
import { Dict } from "../wechat-client/types";

function findElement(obj: Dict, tag: string): any {
    if (obj == null || typeof obj !== "object") return undefined;
    if (obj.hasOwnProperty(tag)) return obj[tag];

    for (const key of Object.keys(obj)) {
        const child = obj[key];
        if (typeof child === "object") {
            const result = findElement(child, tag);
            if (result !== null) return result;
        }
    }
    return undefined;
}

export function parseXml(xml: string): XMLElement {
    const parser = new XMLParser({
        attributeNamePrefix: "",
        ignoreAttributes: false,
    });
    const parsed = parser.parse(xml);
    return new XMLElement(parsed);
}

export class XMLElement {
    static Void = new XMLElement(undefined);

    constructor(private obj: any) {}

    text() {
        if (this.obj == null) return undefined;
        return typeof this.obj === "object" ? this.obj["#text"] : this.obj;
    }

    // get(tag: string) {
    //     if (this.obj == null) return undefined;
    //     if (typeof this.obj !== "object") return undefined;
    //     return this.obj[tag];
    // }

    find(tag: string) {
        if (this.obj == null) return XMLElement.Void;
        if (typeof this.obj !== "object") return XMLElement.Void;
        return new XMLElement(findElement(this.obj, tag));
    }

    prop(property: string) {
        return this.obj?.[property];
    }

    get() {
        return this.obj;
    }
}
