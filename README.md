## Focalors Docker Files

### Usage
1. Clone this branch:
```shell
git clone https://github.com/stkevintan/focalors.git --branch docker --depth 1
cd focalors
```

2. Create `.env` on the project root with your wechaty configurations:
```
# wechaty setting 
WECHATY_PUPPET=wechaty-puppet-padlocal
WECHATY_PUPPET_PADLOCAL_TOKEN=puppet_padlocal_xxxxxxxxxxxxxxxxxxxxx
# azure openai setting
OPENAI_ENDPOINT="https://....."
OPENAI_DEPLOYMENT="..."
OPENAI_DALLE_DEPLOYMENT="..."
OPENAI_APIKEY="...."
# yunzai setting
MASTER_ID="wxid_....."
```
3. Run docker compose with root priviledge:
```shell
sudo docker compose up
```
4. Scan the QR code if present
5. Detach the session by `Ctrl + P` or `Ctrl + Q` (Note, `Ctrl + C` will Stop all the running containers)