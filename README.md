## Focalors Docker Files

### Usage
create `.env` in the project root with your wechaty configurations:
```
WECHATY_PUPPET=wechaty-puppet-padlocal
WECHATY_PUPPET_PADLOCAL_TOKEN=puppet_padlocal_xxxxxxxxxxxxxxxxxxxxx
```

Run compose in root priviledge:
```shell
docker compose up
```