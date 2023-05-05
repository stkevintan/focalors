#! /usr/bin/node

const program = require("../dist/index").Program.create();

program.start().then(
    () => console.log("Focalors is running..."),
    (err) => {
        console.error(err);
        // try stop the program
        return program.stop();
    }
);
