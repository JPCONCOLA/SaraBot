app.get("/login", (request, response) => {
    const clientId = process.env.DISCORD_CLIENT_ID ?? process.env.CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    if (!clientId || !clientSecret) return response.status(500).send(view("Configuración requerida", "<section class=\"card\"><h1>Falta configurar OAuth</h1><p>Añade DISCORD_CLIENT_ID y DISCORD_CLIENT_SECRET en las variables de Railway.</p></section>"));
    
    const currentUrl = process.env.DASHBOARD_URL || `${request.protocol}://${request.get("host")}`;
    const query = new URLSearchParams({ 
        client_id: clientId, 
        redirect_uri: `${currentUrl}/callback`, 
        response_type: "code", 
        scope: "identify guilds" 
    });
    return response.redirect(`https://discord.com/oauth2/authorize?${query}`);
});

app.get("/callback", async (request, response) => {
    const data = dashboardSession(request);
    const code = typeof request.query.code === "string" ? request.query.code : "";
    if (!code) return response.status(400).send("No se recibió el código de autorización de Discord.");

    const clientId = process.env.DISCORD_CLIENT_ID ?? process.env.CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    try {
        const currentUrl = process.env.DASHBOARD_URL || `${request.protocol}://${request.get("host")}`;
        const tokenResponse = await fetch("https://discord.com/api/oauth2/token", { 
            method: "POST", 
            headers: { "Content-Type": "application/x-www-form-urlencoded" }, 
            body: new URLSearchParams({ 
                client_id: clientId!, 
                client_secret: clientSecret!, 
                grant_type: "authorization_code", 
                code, 
                redirect_uri: `${currentUrl}/callback` 
            }) 
        });
        const token = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
        if (!token.access_token) throw new Error(`Token inválido: ${token.error_description || token.error || "Desconocido"}`);
        
        const headers = { Authorization: `Bearer ${token.access_token}` };
        const [userResponse, guildsResponse] = await Promise.all([
            fetch("https://discord.com/api/users/@me", { headers }), 
            fetch("https://discord.com/api/users/@me/guilds", { headers })
        ]);
        
        data.user = await userResponse.json() as DashboardUser;
        data.guilds = await guildsResponse.json() as DiscordGuild[];
        data.csrf = crypto.randomBytes(24).toString("hex");
        return response.redirect("/");
    } catch (error) { 
        console.error(error); 
        return response.status(502).send("No se pudo completar el inicio de sesión con Discord."); 
    }
});