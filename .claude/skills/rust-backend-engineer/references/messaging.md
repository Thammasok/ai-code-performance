# Messaging Reference

## Kafka (rdkafka)

```toml
[dependencies]
rdkafka = { version = "0.36", features = ["cmake-build", "sasl", "ssl"] }
```

### Producer

```rust
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::ClientConfig;

pub fn build_producer(brokers: &str) -> FutureProducer {
    ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("message.timeout.ms", "5000")
        .create()
        .expect("failed to create Kafka producer")
}

pub async fn publish_event(
    producer: &FutureProducer,
    topic: &str,
    key: &str,
    payload: &impl Serialize,
) -> Result<(), KafkaError> {
    let payload = serde_json::to_string(payload)?;
    producer
        .send(
            FutureRecord::to(topic).key(key).payload(&payload),
            Duration::from_secs(5),
        )
        .await
        .map_err(|(e, _)| e)?;
    Ok(())
}
```

### Consumer

```rust
use rdkafka::consumer::{StreamConsumer, Consumer};
use rdkafka::message::Message;

pub async fn run_consumer(brokers: &str, group: &str, topics: &[&str]) -> anyhow::Result<()> {
    let consumer: StreamConsumer = ClientConfig::new()
        .set("group.id", group)
        .set("bootstrap.servers", brokers)
        .set("enable.auto.commit", "false")
        .create()?;

    consumer.subscribe(topics)?;

    loop {
        match consumer.recv().await {
            Err(e) => tracing::error!("kafka error: {e}"),
            Ok(msg) => {
                let payload = msg.payload_view::<str>().unwrap_or(Ok(""))?;
                if let Err(e) = handle_message(payload).await {
                    tracing::error!("handler error: {e}");
                } else {
                    consumer.commit_message(&msg, CommitMode::Async)?;
                }
            }
        }
    }
}
```

---

## RabbitMQ (lapin — AMQP 0-9-1)

```toml
[dependencies]
lapin = "2"
deadpool-lapin = "0.12"
```

```rust
use lapin::{Connection, ConnectionProperties, options::*, types::FieldTable};

pub async fn publish(channel: &Channel, exchange: &str, routing_key: &str, body: &[u8])
    -> lapin::Result<()>
{
    channel
        .basic_publish(
            exchange,
            routing_key,
            BasicPublishOptions::default(),
            body,
            BasicProperties::default().with_content_type("application/json".into()),
        )
        .await?
        .await?;
    Ok(())
}

pub async fn consume(channel: &Channel, queue: &str) -> lapin::Result<()> {
    let mut consumer = channel
        .basic_consume(queue, "my-consumer", BasicConsumeOptions::default(), FieldTable::default())
        .await?;

    while let Some(delivery) = consumer.next().await {
        let delivery = delivery?;
        process(&delivery.data).await?;
        delivery.ack(BasicAckOptions::default()).await?;
    }
    Ok(())
}
```

---

## NATS (async-nats)

```toml
[dependencies]
async-nats = "0.35"
```

```rust
let client = async_nats::connect("nats://localhost:4222").await?;

// Publish
client.publish("orders.created", payload.into()).await?;

// Subscribe (JetStream)
let js = async_nats::jetstream::new(client.clone());
let stream = js.get_or_create_stream(stream_config).await?;
let consumer = stream.create_consumer(consumer_config).await?;
let mut messages = consumer.messages().await?;

while let Some(msg) = messages.next().await {
    let msg = msg?;
    handle(&msg.payload).await?;
    msg.ack().await?;
}
```

---

## Outbox pattern (reliable event publishing)

Publish events atomically with DB writes — prevents dual-write inconsistency.

```sql
CREATE TABLE outbox (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id UUID        NOT NULL,
    event_type   TEXT        NOT NULL,
    payload      JSONB       NOT NULL,
    published_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

```rust
// In same transaction as business mutation:
sqlx::query!(
    "INSERT INTO outbox (aggregate_id, event_type, payload) VALUES ($1, $2, $3)",
    order.id.0, "order.created", serde_json::to_value(&event)?
)
.execute(&mut *tx).await?;
tx.commit().await?;

// Background relay reads outbox and publishes to Kafka/AMQP
// then marks rows as published
```
