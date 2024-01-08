$PROTO_DIR="$PSScriptRoot/src/wcf/proto" | Resolve-Path
$PROTO_GENERATED="$PSScriptRoot/src/wcf/proto-generated" | Resolve-Path
$PROTOC_GEN_TS_PATH="$PSScriptRoot/node_modules/.bin/protoc-gen-ts.cmd"
$GRPC_TOOLS_NODE_PROTOC_PLUGIN = "$PSScriptRoot/node_modules/.bin/grpc_tools_node_protoc_plugin.cmd"
$GRPC_TOOLS_NODE_PROTOC = "$PSScriptRoot/node_modules/.bin/grpc_tools_node_protoc.cmd"

# Generate ts codes for each .proto file using the grpc-tools for Node.

$arguments = @(
    "--plugin=protoc-gen-grpc=$GRPC_TOOLS_NODE_PROTOC_PLUGIN",
    "--plugin=protoc-gen-ts=$PROTOC_GEN_TS_PATH",
    # "--js_out=import_style=commonjs,binary:$PROTO_DIR",
    "--ts_out=$PROTO_GENERATED",
    "--grpc_out=grpc_js:$PROTO_GENERATED",
    "--proto_path=$PROTO_DIR",
    "$PROTO_DIR/*.proto"
)

Start-Process $GRPC_TOOLS_NODE_PROTOC -ArgumentList $arguments -Wait -NoNewWindow