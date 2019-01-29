FROM python:3.6-slim

WORKDIR /app/
RUN groupadd --gid 10001 app && useradd -g app --uid 10001 --shell /usr/sbin/nologin app

RUN apt-get update && \
    apt-get install -y gcc apt-transport-https curl gnupg

# Install Node and Yarn
RUN curl -s https://deb.nodesource.com/gpgkey/nodesource.gpg.key | apt-key add - && \
    echo 'deb https://deb.nodesource.com/node_10.x stretch main' > /etc/apt/sources.list.d/nodesource.list && \
    echo 'deb-src https://deb.nodesource.com/node_10.x stretch main' >> /etc/apt/sources.list.d/nodesource.list && \
    curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add - && \
    echo 'deb https://dl.yarnpkg.com/debian/ stable main' > /etc/apt/sources.list.d/yarn.list && \
    apt-get update && \
    apt-get install -y nodejs yarn

COPY ./requirements.txt /app/requirements.txt
COPY ./requirements-constraints.txt /app/requirements-constraints.txt
COPY ./package.json /app/package.json
COPY ./yarn.lock /app/yarn.lock

RUN pip install -U 'pip>=8' && \
    pip install --no-cache-dir -r requirements.txt && \
    yarn install --non-interactive --prod

# Install the app
COPY . /app/
RUN yarn build --prod

# Set Python-related environment variables to reduce annoying-ness
ENV PYTHONUNBUFFERED 1
ENV PYTHONDONTWRITEBYTECODE 1
ENV PORT 5000

USER app

EXPOSE $PORT

CMD python app.py
