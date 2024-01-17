import { singleton } from "tsyringe";

@singleton()
export class Configuration {
    endpoint = process.env["OPENAI_ENDPOINT"];
    deployment = process.env["OPENAI_DEPLOYMENT"];
    dalleDeployment = process.env["OPENAI_DALLE_DEPLOYMENT"];
    apiKey = process.env["OPENAI_APIKEY"];
    apiVersion = "2023-12-01-preview";
    tokenLimit = 1000;
    // keep last 20 conversations
    contextLength = 20;
}
