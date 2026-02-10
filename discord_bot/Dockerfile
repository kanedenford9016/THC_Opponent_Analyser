FROM python:3.11.8-slim

WORKDIR /app

RUN apt-get update \
    ; apt-get install -y --no-install-recommends libfreetype6 libjpeg62-turbo \
    ; rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt
COPY discord_bot/requirements.txt ./discord_bot.requirements.txt
RUN pip install --no-cache-dir -r requirements.txt -r discord_bot.requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1

CMD ["python", "-m", "discord_bot"]
