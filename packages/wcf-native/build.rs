extern crate napi_build;

fn main() {
  // tonic_build::configure()
  //   .build_client(true)
  //   .build_server(false)
  //   .out_dir("src/proto")
  //   .compile(&["proto/wcf.proto"], &["."])
  //   .expect("failed to compile protos");

  napi_build::setup();
}
