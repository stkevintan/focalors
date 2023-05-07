## Focalors Docker Files

### Usage
1. Create `.env` on the project root with your wechaty configurations:
```
WECHATY_PUPPET=wechaty-puppet-padlocal
WECHATY_PUPPET_PADLOCAL_TOKEN=puppet_padlocal_xxxxxxxxxxxxxxxxxxxxx
```

2. Run docker compose with root priviledge:
```shell
sudo docker compose up
```

3. Scan the QR code if present

4. Detach the session by `Ctrl + P` or `Ctrl + Q` (Note, `Ctrl + C` will Stop all the running containers)