const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Supabase Client
const supabaseUrl = 'https://niqyditsjouvhclprtpk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pcXlkaXRzam91dmhjbHBydHBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MzEyMzIsImV4cCI6MjA3OTMwNzIzMn0.Pnml-SFLT8X38GuQGu7G-mQsrNyvufModJ5N5b9m96s';
const supabase = createClient(supabaseUrl, supabaseKey);

// WhatsApp Service (simulado)
class WhatsAppService {
    static async sendMessage(phone, message) {
        console.log(`📱 WhatsApp para ${phone}: ${message}`);
        // Implementação real com Twilio ou outra API
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

// Rotas da API

// Login Admin
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const { data: admin, error } = await supabase
            .from('admins')
            .select('*')
            .eq('username', username)
            .single();

        if (error || !admin) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        const validPassword = await bcrypt.compare(password, admin.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        res.json({ message: 'Login realizado com sucesso' });
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

        res.json(orders);
    } catch (error) {
        console.error('Erro ao buscar pedidos:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Criar pedido
app.post('/api/orders', async (req, res) => {
    try {
        const { customer_name, whatsapp, items, total_amount, payment_method, notes } = req.body;

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
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Rota padrão
app.get('/', (req, res) => {
    res.json({ 
        message: 'API do Bar da Tapioca - Node.js 22',
        version: '1.0.0'
    });
});

// Tratamento de erros
app.use((err, req, res, next) => {
    console.error(err.stack);
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
    console.log(`⚡ Node.js version: ${process.version}`);
});

module.exports = app;