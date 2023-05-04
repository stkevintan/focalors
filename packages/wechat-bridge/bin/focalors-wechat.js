#! /usr/bin/node

require("../dist/index")
    .entrypoint()
    .start()
    .then(
        () => console.log("Focalors is running..."),
        (err) => console.error(err)
    );
