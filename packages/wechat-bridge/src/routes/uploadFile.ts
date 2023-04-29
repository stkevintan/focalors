import { Protocol } from "@focalors/yunzai-client";

export class UploadFileRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.UploadFileAction>
{
    readonly action = "upload_file";
    async handle(
        req: Protocol.UploadFileAction[0]
    ): Promise<Protocol.UploadFileAction[1]> {
        return {
            echo: req.echo,
            data: {
                file_id: "fake_file_id",
            },
        };
    }
}
