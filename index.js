const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Configuração CORS
const corsOptions = {
  origin: [
    'https://bardotapioca.vercel.app',
    'http://localhost:3000',
    'http://localhost:5000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.options('*', cors(corsOptions));

// Supabase Client
const supabaseUrl = 'https://niqyditsjouvhclprtpk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pcXlkaXRzam91dmhjbHBydHBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MzEyMzIsImV4cCI6MjA3OTMwNzIzMn0.Pnml-SFLT8X38GuQGu7G-mQsrNyvufModJ5N5b9m96s';
const supabase = createClient(supabaseUrl, supabaseKey);

// WhatsApp Service (simulado)
class WhatsAppService {
    static async sendMessage(phone, message) {
        console.log(`📱 WhatsApp para ${phone}: ${message}`);
        return true;
    }

    static async sendOrderUpdate(phone, orderId, status) {
        const messages = {
            'preparing': `🍳 Seu pedido #${orderId} está sendo preparado! Aguarde nosso contato.`,
            'ready': `✅ Seu pedido #${orderId} está pronto! Pode vir buscar.`,
            'completed': `🎉 Obrigado! Pedido #${orderId} finalizado com sucesso!`
        };

        const message = messages[status];
        if (message) {
            await this.sendMessage(phone, message);
        }
    }
}

// Middleware de log
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Rotas da API

// Login Admin (SEM hash - comparação direta)
app.post('/api/admin/login', async (req, res) => {
    try {
        console.log('Tentativa de login:', req.body);
        
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
        }

        const { data: admin, error } = await supabase
            .from('admins')
            .select('*')
            .eq('username', username)
            .single();

        if (error || !admin) {
            console.log('Admin não encontrado:', username);
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // COMPARAÇÃO DIRETA (sem hash)
        if (admin.password !== password) {
            console.log('Senha inválida para:', username);
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        console.log('Login bem-sucedido:', username);
        res.json({ 
            message: 'Login realizado com sucesso',
            user: { username: admin.username }
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Listar pedidos
app.get('/api/orders', async (req, res) => {
    try {
        const { data: orders, error } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(orders || []);
    } catch (error) {
        console.error('Erro ao buscar pedidos:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Criar pedido
app.post('/api/orders', async (req, res) => {
    try {
        const { customer_name, whatsapp, items, total_amount, payment_method, notes } = req.body;

        console.log('Novo pedido:', { customer_name, whatsapp, total_amount });

        const { data: order, error } = await supabase
            .from('orders')
            .insert([
                {
                    customer_name,
                    whatsapp,
                    items: JSON.stringify(items),
                    total_amount,
                    payment_method,
                    notes,
                    status: 'pending'
                }
            ])
            .select()
            .single();

        if (error) throw error;

        // Enviar confirmação via WhatsApp
        await WhatsAppService.sendMessage(
            whatsapp, 
            `✅ Pedido recebido! Nº ${order.id}\nTotal: R$ ${total_amount}\nForma de pagamento: ${payment_method}\nAguarde nosso contato!`
        );

        res.status(201).json(order);
    } catch (error) {
        console.error('Erro ao criar pedido:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Atualizar status do pedido
app.put('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        console.log(`Atualizando pedido ${id} para status: ${status}`);

        // Buscar pedido atual
        const { data: currentOrder, error: fetchError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        // Atualizar pedido
        const { data: order, error } = await supabase
            .from('orders')
            .update({ 
                status, 
                updated_at: new Date().toISOString() 
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Enviar atualização via WhatsApp se o status mudou
        if (currentOrder.status !== status) {
            await WhatsAppService.sendOrderUpdate(currentOrder.whatsapp, id, status);
        }

        res.json(order);
    } catch (error) {
        console.error('Erro ao atualizar pedido:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        cors: 'enabled',
        frontend: 'bardotapioca.vercel.app'
    });
});

// Rota padrão
app.get('/', (req, res) => {
    res.json({ 
        message: 'API do Bar da Tapioca - Node.js 22 - SENHA TEXTO',
        version: '1.0.2',
        endpoints: {
            health: '/api/health',
            orders: '/api/orders',
            admin_login: '/api/admin/login'
        }
    });
});

// Tratamento de erros
app.use((err, req, res, next) => {
    console.error('Erro global:', err.stack);
    res.status(500).json({ error: 'Algo deu errado!' });
});

// 404 Handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📱 API disponível em: http://localhost:${PORT}/api`);
    console.log(`🌐 CORS habilitado para: bardotapioca.vercel.app`);
    console.log(`🔓 Login: admin / admin123 (senha em texto)`);
    console.log(`⚡ Node.js version: ${process.version}`);
});

module.exports = app;