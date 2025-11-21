const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Configuração CORS
const corsOptions = {
  origin: ['https://bardotapioca.vercel.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());
app.options('*', cors(corsOptions));

// Supabase Client
const supabaseUrl = 'https://niqyditsjouvhclprtpk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pcXlkaXRzam91dmhjbHBydHBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MzEyMzIsImV4cCI6MjA3OTMwNzIzMn0.Pnml-SFLT8X38GuQGu7G-mQsrNyvufModJ5N5b9m96s';
const supabase = createClient(supabaseUrl, supabaseKey);

// Login Admin - COM LOGS DETALHADOS
app.post('/api/admin/login', async (req, res) => {
    try {
        console.log('=== TENTATIVA DE LOGIN ===');
        console.log('Body recebido:', req.body);
        
        const { username, password } = req.body;

        if (!username || !password) {
            console.log('❌ Dados faltando');
            return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
        }

        console.log('🔍 Buscando admin no banco...');
        const { data: admin, error } = await supabase
            .from('admins')
            .select('*')
            .eq('username', username)
            .single();

        console.log('Resultado da busca:', { admin, error });

        if (error) {
            console.log('❌ Erro na busca:', error);
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        if (!admin) {
            console.log('❌ Admin não encontrado');
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        console.log('🔑 Comparando senhas:');
        console.log('Senha do banco:', admin.password);
        console.log('Senha recebida:', password);
        console.log('São iguais?', admin.password === password);

        // COMPARAÇÃO DIRETA
        if (admin.password !== password) {
            console.log('❌ Senha incorreta');
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        console.log('✅ Login bem-sucedido!');
        res.json({ 
            message: 'Login realizado com sucesso',
            user: { username: admin.username }
        });
    } catch (error) {
        console.error('💥 ERRO NO LOGIN:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString()
    });
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
        res.status(500).json({ error: 'Erro interno' });
    }
});

// Criar pedido
app.post('/api/orders', async (req, res) => {
    try {
        const { customer_name, whatsapp, items, total_amount, payment_method, notes } = req.body;
        
        const { data: order, error } = await supabase
            .from('orders')
            .insert([{
                customer_name, whatsapp, items: JSON.stringify(items),
                total_amount, payment_method, notes, status: 'pending'
            }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(order);
    } catch (error) {
        res.status(500).json({ error: 'Erro interno' });
    }
});

app.listen(3000, () => {
    console.log('🚀 Backend com DEBUG rodando...');
});