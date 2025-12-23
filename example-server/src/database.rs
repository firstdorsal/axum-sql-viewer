use sqlx::sqlite::SqlitePool;

pub async fn setup(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    // Create users table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT true
        )
        "#,
    )
    .execute(pool)
    .await?;

    // Create products table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            stock INTEGER DEFAULT 0,
            category TEXT
        )
        "#,
    )
    .execute(pool)
    .await?;

    // Create orders table with foreign keys
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id),
            product_id INTEGER REFERENCES products(id),
            quantity INTEGER NOT NULL,
            total REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        "#,
    )
    .execute(pool)
    .await?;

    // Create wide_table with many columns for testing horizontal scrolling
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS wide_table (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            column_a TEXT,
            column_b TEXT,
            column_c TEXT,
            column_d TEXT,
            column_e TEXT,
            column_f TEXT,
            column_g TEXT,
            column_h TEXT,
            column_i TEXT,
            column_j TEXT,
            column_k TEXT,
            column_l TEXT,
            column_m TEXT,
            column_n TEXT,
            column_o TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        "#,
    )
    .execute(pool)
    .await?;

    // Seed sample data if tables are empty
    seed_sample_data(pool).await?;

    Ok(())
}

async fn seed_sample_data(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    // Check if users table already has data
    let user_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await?;

    if user_count.0 > 0 {
        // Data already seeded
        return Ok(());
    }

    // Insert many sample users for testing virtual scrolling (1000+ users)
    let first_names = [
        "Alice", "Bob", "Charlie", "Diana", "Evan", "Fiona", "George", "Hannah",
        "Isaac", "Julia", "Kevin", "Laura", "Michael", "Nancy", "Oscar", "Patricia",
        "Quinn", "Rachel", "Steven", "Tina", "Ulysses", "Victoria", "Walter", "Xena",
        "Yolanda", "Zachary", "Aaron", "Bella", "Chris", "Donna", "Edward", "Faith",
        "Greg", "Helen", "Ivan", "Jane", "Kyle", "Lily", "Mark", "Nina",
    ];
    let last_names = [
        "Johnson", "Smith", "Brown", "Prince", "Davis", "Wilson", "Taylor", "Anderson",
        "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez",
        "Robinson", "Clark", "Rodriguez", "Lewis", "Lee", "Walker", "Hall", "Allen",
        "Young", "King", "Wright", "Scott", "Green", "Baker", "Adams", "Nelson",
        "Hill", "Moore", "Mitchell", "Roberts", "Carter", "Phillips", "Evans", "Turner",
    ];

    // Generate 200 users
    for index in 0..200 {
        let first = first_names[index % first_names.len()];
        let last = last_names[index % last_names.len()];
        let email = format!("{}.{}{}@example.com", first.to_lowercase(), last.to_lowercase(), index);
        let is_active = index % 5 != 0;
        sqlx::query("INSERT INTO users (name, email, is_active) VALUES (?, ?, ?)")
            .bind(format!("{} {}", first, last))
            .bind(email)
            .bind(is_active)
            .execute(pool)
            .await?;
    }

    // Insert many sample products (200+ products)
    let categories = ["Electronics", "Furniture", "Stationery", "Clothing", "Sports", "Books", "Kitchen", "Garden", "Automotive", "Toys"];
    let product_prefixes = ["Premium", "Basic", "Pro", "Elite", "Standard", "Budget", "Deluxe", "Ultra", "Compact", "Advanced"];
    let product_types = [
        "Laptop", "Mouse", "Keyboard", "Monitor", "Chair", "Desk", "Notebook", "Pen",
        "Headphones", "Webcam", "Microphone", "Speaker", "Tablet", "Phone", "Watch", "Lamp",
        "Shelf", "Cabinet", "Printer", "Scanner", "Router", "Cable", "Adapter", "Stand",
        "Bag", "Charger", "Battery", "Cover", "Screen", "Mount", "Hub", "Dock",
        "Light", "Fan", "Cooler", "Heater", "Filter", "Case", "Sleeve", "Holder",
    ];

    // Generate 200 products
    for index in 0..200 {
        let prefix = product_prefixes[index % product_prefixes.len()];
        let product_type = product_types[index % product_types.len()];
        let category = categories[index % categories.len()];
        let price = 5.99 + (index as f64 * 12.5) + ((index % 7) as f64 * 3.33);
        let stock = (index * 7 + 5) % 500;

        sqlx::query("INSERT INTO products (name, price, stock, category) VALUES (?, ?, ?, ?)")
            .bind(format!("{} {} {}", prefix, product_type, index + 1))
            .bind(price)
            .bind(stock as i32)
            .bind(category)
            .execute(pool)
            .await?;
    }

    // Insert many sample orders (2000 rows for testing virtual scrolling)
    let statuses = ["pending", "processing", "shipped", "completed", "cancelled", "refunded", "on_hold"];

    for index in 0..2000 {
        let user_id = (index % 200) + 1;
        let product_id = (index % 200) + 1;
        let quantity = (index % 10) + 1;
        let base_price = 5.99 + ((product_id as f64) * 12.5);
        let total = (quantity as f64) * base_price;
        let status = statuses[index % statuses.len()];

        sqlx::query("INSERT INTO orders (user_id, product_id, quantity, total, status) VALUES (?, ?, ?, ?, ?)")
            .bind(user_id as i32)
            .bind(product_id as i32)
            .bind(quantity as i32)
            .bind(total)
            .bind(status)
            .execute(pool)
            .await?;
    }

    // Insert sample data for wide_table
    for index in 0..100 {
        sqlx::query(
            "INSERT INTO wide_table (column_a, column_b, column_c, column_d, column_e, column_f, column_g, column_h, column_i, column_j, column_k, column_l, column_m, column_n, column_o) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(format!("Value A{}", index))
        .bind(format!("Value B{}", index))
        .bind(format!("Value C{}", index))
        .bind(format!("Value D{}", index))
        .bind(format!("Value E{}", index))
        .bind(format!("Value F{}", index))
        .bind(format!("Value G{}", index))
        .bind(format!("Value H{}", index))
        .bind(format!("Value I{}", index))
        .bind(format!("Value J{}", index))
        .bind(format!("Value K{}", index))
        .bind(format!("Value L{}", index))
        .bind(format!("Value M{}", index))
        .bind(format!("Value N{}", index))
        .bind(format!("Value O{}", index))
        .execute(pool)
        .await?;
    }

    println!("Sample data seeded successfully: 200 users, 200 products, 2000 orders, 100 wide_table rows");
    Ok(())
}
