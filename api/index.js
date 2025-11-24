import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

console.log('🚀 Iniciando backend Bar do Vaqueiro...');
console.log('📡 Supabase URL:', supabaseUrl ? '✅ Configurada' : '❌ Faltando');
console.log('🔑 Supabase KEY:', supabaseKey ? '✅ Configurada' : '❌ Faltando');

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ ERRO: Variáveis de ambiente SUPABASE_URL e SUPABASE_KEY são obrigatórias");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase cliente criado com sucesso!');

// Middleware CORS CONFIGURADO - PERMITE TODOS OS DOMÍNIOS
app.use(cors({
    origin: "*",
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Função para criptografar
function simpleEncrypt(text) {
    return Buffer.from(text).toString('base64').split('').reverse().join('');
}

// Função para descriptografar
function simpleDecrypt(encrypted) {
    return Buffer.from(encrypted.split('').reverse().join(''), 'base64').toString('utf8');
}

// Normalizar categorias
function normalizeCategories(categories) {
    if (!Array.isArray(categories)) return [];
    
    return categories.map(cat => {
        if (typeof cat === 'string') {
            return {
                id: cat,
                name: cat.charAt(0).toUpperCase() + cat.slice(1),
                description: `Categoria de ${cat}`
            };
        }
        if (cat && typeof cat === 'object' && cat.id) {
            return {
                id: cat.id,
                name: cat.name || cat.id.charAt(0).toUpperCase() + cat.id.slice(1),
                description: cat.description || `Categoria de ${cat.name || cat.id}`
            };
        }
        return null;
    }).filter(cat => cat !== null);
}

// Normalizar produtos
function normalizeProducts(products) {
    if (!Array.isArray(products)) return [];
    
    return products.map(product => {
        // Converter estrutura antiga (cores/sizes) para nova estrutura (sabores/quantity)
        if (product.colors && Array.isArray(product.colors)) {
            return {
                ...product,
                sabores: product.colors.map(color => ({
                    name: color.name || 'Sem nome',
                    image: color.image || 'https://via.placeholder.com/400x300',
                    quantity: color.sizes ? color.sizes.reduce((total, size) => total + (size.stock || 0), 0) : (color.quantity || 0),
                    description: color.description || ''
                }))
            };
        }
        
        // Se já tem sabores, garantir que está no formato correto E ORDENAR SABORES DISPONÍVEIS PRIMEIRO
        if (product.sabores && Array.isArray(product.sabores)) {
            // CORREÇÃO: Ordenar sabores - disponíveis primeiro, esgotados depois
            const sortedSabores = [...product.sabores].sort((a, b) => {
                const aStock = a.quantity || 0;
                const bStock = b.quantity || 0;
                
                // Sabores com estoque > 0 vêm primeiro
                if (aStock > 0 && bStock === 0) return -1;
                if (aStock === 0 && bStock > 0) return 1;
                
                // Se ambos têm estoque ou ambos estão esgotados, mantém a ordem original
                return 0;
            });
            
            return {
                ...product,
                sabores: sortedSabores.map(sabor => ({
                    name: sabor.name || 'Sem nome',
                    image: sabor.image || 'https://via.placeholder.com/400x300',
                    quantity: sabor.quantity || 0,
                    description: sabor.description || ''
                }))
            };
        }
        
        return product;
    });
}

// Normalizar pedidos
function normalizeOrders(orders) {
    if (!Array.isArray(orders)) return [];
    
    return orders.map(order => ({
        id: order.id,
        date: order.date,
        time: order.time,
        customerName: order.customer_name || order.customerName,
        customerPhone: order.customer_phone || order.customerPhone,
        items: Array.isArray(order.items) ? order.items : [],
        total: parseFloat(order.total) || 0,
        paymentMethod: order.payment_method || order.paymentMethod,
        status: order.status || 'pending',
        createdAt: order.created_at || order.createdAt
    }));
}

// Verificar autenticação
function checkAuth(token) {
    return token === "authenticated_admin_token";
}

// Garantir que as credenciais admin existem
async function ensureAdminCredentials() {
    try {
        console.log('🔐 Verificando credenciais admin...');
        
        const { data: existingCreds, error: fetchError } = await supabase
            .from('admin_credentials')
            .select('*')
            .eq('username', 'admin')
            .single();

        if (fetchError || !existingCreds) {
            console.log('➕ Criando credenciais admin...');
            const adminPassword = 'admin123';
            const encryptedPassword = simpleEncrypt(adminPassword);
            
            const { data, error } = await supabase
                .from('admin_credentials')
                .insert([{
                    username: 'admin',
                    password: adminPassword,
                    encrypted_password: encryptedPassword
                }])
                .select()
                .single();

            if (error) {
                console.error('❌ Erro ao criar credenciais:', error);
                return false;
            } else {
                console.log('✅ Credenciais admin criadas com sucesso!');
                console.log('📋 Usuário: admin');
                console.log('🔑 Senha: admin123');
                return true;
            }
        } else {
            console.log('✅ Credenciais admin já existem');
            return true;
        }
    } catch (error) {
        console.error('❌ Erro ao verificar credenciais:', error);
        return false;
    }
}

// ENDPOINTS DA API

// Health check
app.get("/", (req, res) => {
    res.json({ 
        message: "🚀 Backend Bar do Vaqueiro está funcionando!", 
        status: "OK",
        platform: "Vercel Serverless",
        timestamp: new Date().toISOString()
    });
});

// Buscar produtos - COM FALLBACK SE TABELA NÃO EXISTIR
app.get("/api/products", async (req, res) => {
    try {
        console.log('🔄 Buscando produtos do Supabase...');
        
        const { data: products, error } = await supabase
            .from('products')
            .select('*')
            .order('display_order', { ascending: true, nullsFirst: false })
            .order('id');

        if (error) {
            console.error('❌ Erro ao buscar produtos:', error.message);
            
            // Se tabela não existe, retornar produtos de exemplo
            if (error.message.includes('does not exist')) {
                console.log('📦 Tabela products não existe, retornando exemplo...');
                const produtosExemplo = [
                    {
                        id: 1,
                        title: "Cerveja Heineken",
                        category: "cerveja",
                        price: 12.00,
                        description: "Cerveja premium importada",
                        sabores: [
                            {
                                name: "Long Neck",
                                image: "https://via.placeholder.com/400x300/8B4513/FFFFFF?text=🍺",
                                quantity: 50,
                                description: "Garrafa 330ml"
                            }
                        ],
                        status: "active",
                        display_order: 1
                    },
                    {
                        id: 2,
                        title: "Porção de Batata Frita",
                        category: "petisco",
                        price: 25.00,
                        description: "Porção de batata frita crocante",
                        sabores: [
                            {
                                name: "Média",
                                image: "https://via.placeholder.com/400x300/8B4513/FFFFFF?text=🍟",
                                quantity: 20,
                                description: "Porção para 2 pessoas"
                            }
                        ],
                        status: "active",
                        display_order: 2
                    }
                ];
                return res.json({ products: produtosExemplo });
            }
            
            return res.json({ products: [] });
        }

        console.log(`✅ ${products?.length || 0} produtos encontrados`);
        
        // Se não há produtos, retornar exemplo
        if (!products || products.length === 0) {
            console.log('📦 Nenhum produto no banco, retornando exemplo...');
            const produtosExemplo = [
                {
                    id: 1,
                    title: "Cerveja de Teste",
                    category: "cerveja",
                    price: 10.00,
                    description: "Cerveja de exemplo para teste",
                    sabores: [
                        {
                            name: "Long Neck",
                            image: "https://via.placeholder.com/400x300/8B4513/FFFFFF?text=🍺",
                            quantity: 10,
                            description: "Garrafa de teste"
                        }
                    ],
                    status: "active",
                    display_order: 1
                }
            ];
            return res.json({ products: produtosExemplo });
        }

        const normalizedProducts = normalizeProducts(products);
        res.json({ products: normalizedProducts });
        
    } catch (error) {
        console.error('❌ Erro geral em /api/products:', error);
        res.json({ products: [] });
    }
});

// Buscar categorias - COM FALLBACK SE TABELA NÃO EXISTIR
app.get("/api/categories", async (req, res) => {
    try {
        console.log('🔄 Buscando categorias do Supabase...');
        
        const { data: categories, error } = await supabase
            .from('categories')
            .select('*')
            .order('name');

        if (error) {
            console.error('❌ Erro ao buscar categorias:', error.message);
            
            // Se tabela não existe, retornar categorias de exemplo
            if (error.message.includes('does not exist')) {
                console.log('🏷️ Tabela categories não existe, retornando exemplo...');
                const categoriasExemplo = [
                    {
                        id: "cerveja",
                        name: "Cervejas",
                        description: "Cervejas de diversos tipos e marcas"
                    },
                    {
                        id: "refrigerante", 
                        name: "Refrigerantes",
                        description: "Refrigerantes e bebidas não alcoólicas"
                    },
                    {
                        id: "petisco",
                        name: "Petiscos",
                        description: "Petiscos e acompanhamentos"
                    }
                ];
                return res.json({ categories: categoriasExemplo });
            }
            
            return res.json({ categories: [] });
        }

        console.log(`✅ ${categories?.length || 0} categorias encontradas`);
        
        // Se não há categorias, retornar exemplo
        if (!categories || categories.length === 0) {
            console.log('🏷️ Nenhuma categoria no banco, retornando exemplo...');
            const categoriasExemplo = [
                {
                    id: "cerveja",
                    name: "Cervejas",
                    description: "Cervejas diversas"
                }
            ];
            return res.json({ categories: categoriasExemplo });
        }

        const normalizedCategories = normalizeCategories(categories);
        res.json({ categories: normalizedCategories });
        
    } catch (error) {
        console.error('❌ Erro geral em /api/categories:', error);
        res.json({ categories: [] });
    }
});

// Buscar pedidos
app.get("/api/orders", async (req, res) => {
    try {
        console.log('🔄 Buscando pedidos do Supabase...');
        
        const { data: orders, error } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Erro ao buscar pedidos:', error.message);
            
            // Se tabela não existe, retornar vazio
            if (error.message.includes('does not exist')) {
                console.log('📋 Tabela orders não existe, retornando vazio...');
                return res.json({ orders: [] });
            }
            
            return res.json({ orders: [] });
        }

        console.log(`✅ ${orders?.length || 0} pedidos encontrados`);
        
        const normalizedOrders = normalizeOrders(orders || []);
        res.json({ orders: normalizedOrders });
        
    } catch (error) {
        console.error('❌ Erro geral em /api/orders:', error);
        res.json({ orders: [] });
    }
});

// Salvar pedido
app.post("/api/orders", async (req, res) => {
    try {
        const { orderData } = req.body;
        
        console.log('💾 Salvando pedido:', orderData?.customerName);
        
        if (!orderData || !orderData.customerName) {
            return res.status(400).json({ error: "Dados do pedido inválidos" });
        }

        const orderToSave = {
            date: orderData.date,
            time: orderData.time,
            customer_name: orderData.customerName,
            customer_phone: orderData.customerPhone,
            items: Array.isArray(orderData.items) ? orderData.items : [],
            total: orderData.total || 0,
            payment_method: orderData.paymentMethod,
            status: orderData.status || 'pending'
        };

        console.log('📦 Dados do pedido a serem salvos:', orderToSave);

        const { data, error } = await supabase
            .from('orders')
            .insert([orderToSave])
            .select();

        if (error) {
            console.error('❌ Erro ao salvar pedido:', error);
            throw error;
        }

        console.log('✅ Pedido salvo com sucesso!');
        res.json({ success: true, message: "Pedido registrado", orderId: data[0].id });
        
    } catch (error) {
        console.error("❌ Erro ao salvar pedido:", error);
        res.status(500).json({ error: "Erro ao salvar pedido: " + error.message });
    }
});

// Atualizar status do pedido
app.post("/api/orders/update-status", async (req, res) => {
    try {
        const { orderId, status } = req.body;
        
        console.log(`🔄 Atualizando status do pedido ${orderId} para ${status}`);
        
        if (!orderId || !status) {
            return res.status(400).json({ error: "ID do pedido e status são obrigatórios" });
        }

        const { error } = await supabase
            .from('orders')
            .update({ 
                status: status,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);

        if (error) {
            console.error('❌ Erro ao atualizar status do pedido:', error);
            throw error;
        }

        console.log('✅ Status do pedido atualizado com sucesso!');
        res.json({ success: true, message: `Status do pedido atualizado para ${status}` });
        
    } catch (error) {
        console.error("❌ Erro ao atualizar status do pedido:", error);
        res.status(500).json({ error: "Erro ao atualizar status do pedido: " + error.message });
    }
});

// Autenticação - COM FALLBACK SE TABELA NÃO EXISTIR
app.post("/api/auth/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('🔐 Tentativa de login:', username);

        if (!username || !password) {
            return res.status(400).json({ error: "Usuário e senha são obrigatórios" });
        }

        // Tenta buscar credenciais no Supabase
        const { data: credentials, error } = await supabase
            .from('admin_credentials')
            .select('*')
            .eq('username', username)
            .single();

        if (error) {
            console.log('❌ Erro ao buscar credenciais:', error.message);
            
            // Se tabela não existe ou não tem credenciais, usar padrão
            if (error.message.includes('does not exist') || error.code === 'PGRST116') {
                console.log('👤 Usando credenciais padrão...');
                
                // Credenciais padrão de fallback
                if (username === "admin" && password === "admin123") {
                    console.log('✅ Login bem-sucedido com credenciais padrão');
                    return res.json({ 
                        success: true, 
                        token: "authenticated_admin_token", 
                        user: { username: "admin" } 
                    });
                } else {
                    console.log('❌ Credenciais padrão incorretas');
                    return res.status(401).json({ error: "Credenciais inválidas" });
                }
            }
            
            return res.status(401).json({ error: "Erro no sistema" });
        }

        if (!credentials) {
            console.log('❌ Credenciais não encontradas');
            return res.status(401).json({ error: "Credenciais inválidas" });
        }

        console.log('🔍 Credencial encontrada:', credentials.username);
        
        // Verificar senha (texto plano para simplificar)
        const isPlainPasswordValid = password === credentials.password;
        const encryptedInput = simpleEncrypt(password);
        const isPasswordValid = encryptedInput === credentials.encrypted_password;

        if (isPasswordValid || isPlainPasswordValid) {
            console.log('✅ Login bem-sucedido para:', username);
            res.json({ 
                success: true, 
                token: "authenticated_admin_token", 
                user: { username: username } 
            });
        } else {
            console.log('❌ Senha incorreta para:', username);
            res.status(401).json({ error: "Credenciais inválidas" });
        }
    } catch (error) {
        console.error("❌ Erro no login:", error);
        res.status(500).json({ error: "Erro no processo de login" });
    }
});

// Verificar autenticação
app.get("/api/auth/verify", async (req, res) => {
    try {
        const token = req.headers.authorization?.replace("Bearer ", "");
        
        if (token && checkAuth(token)) {
            res.json({ valid: true, user: { username: "admin" } });
        } else {
            res.json({ valid: false });
        }
    } catch (error) {
        console.error("Erro ao verificar autenticação:", error);
        res.status(500).json({ error: "Erro ao verificar autenticação" });
    }
});

// Salvar produtos
app.post("/api/products", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !checkAuth(authHeader.replace("Bearer ", ""))) {
            return res.status(401).json({ error: "Não autorizado" });
        }
        
        const { products } = req.body;
        console.log(`💾 Salvando ${products?.length || 0} produtos...`);
        
        const normalizedProducts = normalizeProducts(products);

        const { error: deleteError } = await supabase
            .from('products')
            .delete()
            .neq('id', 0);

        if (deleteError) {
            console.error('❌ Erro ao deletar produtos:', deleteError);
            throw deleteError;
        }

        if (normalizedProducts.length > 0) {
            const productsToInsert = normalizedProducts.map(product => ({
                title: product.title,
                category: product.category,
                price: product.price,
                description: product.description,
                status: product.status,
                sabores: product.sabores,
                display_order: product.display_order || 0
            }));

            const { error: insertError } = await supabase
                .from('products')
                .insert(productsToInsert);

            if (insertError) {
                console.error('❌ Erro ao inserir produtos:', insertError);
                throw insertError;
            }
        }

        console.log('✅ Produtos salvos com sucesso!');
        res.json({ success: true, message: `${normalizedProducts.length} produtos salvos` });
    } catch (error) {
        console.error("❌ Erro ao salvar produtos:", error);
        res.status(500).json({ error: "Erro ao salvar produtos: " + error.message });
    }
});

// Adicionar categoria
app.post("/api/categories/add", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !checkAuth(authHeader.replace("Bearer ", ""))) {
            return res.status(401).json({ error: "Não autorizado" });
        }
        
        const { category } = req.body;
        
        if (!category || !category.id || !category.name) {
            return res.status(400).json({ error: "Dados da categoria inválidos" });
        }

        console.log(`➕ Adicionando categoria: ${category.name} (ID: ${category.id})`);

        const { data, error } = await supabase
            .from('categories')
            .upsert([{
                id: category.id,
                name: category.name,
                description: category.description || `Categoria de ${category.name}`
            }], {
                onConflict: 'id',
                ignoreDuplicates: false
            });

        if (error) {
            console.error('❌ Erro ao adicionar categoria:', error);
            throw error;
        }

        console.log('✅ Categoria adicionada com sucesso:', category.name);
        res.json({ success: true, message: `Categoria "${category.name}" adicionada` });
    } catch (error) {
        console.error("❌ Erro ao adicionar categoria:", error);
        res.status(500).json({ error: "Erro ao adicionar categoria: " + error.message });
    }
});

// Excluir categoria
app.post("/api/categories/delete", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !checkAuth(authHeader.replace("Bearer ", ""))) {
            return res.status(401).json({ error: "Não autorizado" });
        }
        
        const { categoryId } = req.body;
        
        if (!categoryId) {
            return res.status(400).json({ error: "ID da categoria é obrigatório" });
        }

        console.log(`🗑️ Excluindo categoria: ${categoryId}`);

        // Primeiro, verificar se existem produtos nesta categoria
        const { data: productsInCategory, error: productsError } = await supabase
            .from('products')
            .select('id, title')
            .eq('category', categoryId);

        if (productsError) {
            console.error('❌ Erro ao verificar produtos da categoria:', productsError);
            throw productsError;
        }

        // Se existem produtos nesta categoria, mover para categoria padrão ou deixar sem categoria
        if (productsInCategory && productsInCategory.length > 0) {
            console.log(`📦 Movendo ${productsInCategory.length} produtos para categoria padrão...`);
            
            const { error: updateError } = await supabase
                .from('products')
                .update({ category: 'default' })
                .eq('category', categoryId);

            if (updateError) {
                console.error('❌ Erro ao mover produtos:', updateError);
                throw updateError;
            }

            console.log(`✅ ${productsInCategory.length} produtos movidos para categoria padrão`);
        }

        // Agora excluir a categoria
        const { error: deleteError } = await supabase
            .from('categories')
            .delete()
            .eq('id', categoryId);

        if (deleteError) {
            console.error('❌ Erro ao excluir categoria:', deleteError);
            throw deleteError;
        }

        console.log('✅ Categoria excluída com sucesso:', categoryId);
        res.json({ 
            success: true, 
            message: `Categoria excluída com sucesso! ${productsInCategory?.length || 0} produtos foram movidos para categoria padrão.` 
        });
    } catch (error) {
        console.error("❌ Erro ao excluir categoria:", error);
        res.status(500).json({ error: "Erro ao excluir categoria: " + error.message });
    }
});

// Salvar categorias
app.post("/api/categories", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !checkAuth(authHeader.replace("Bearer ", ""))) {
            return res.status(401).json({ error: "Não autorizado" });
        }
        
        const { categories } = req.body;
        console.log(`💾 Salvando ${categories?.length || 0} categorias...`);
        
        const normalizedCategories = normalizeCategories(categories);

        if (normalizedCategories.length === 0) {
            return res.status(400).json({ error: "Nenhuma categoria fornecida" });
        }

        const categoryIds = normalizedCategories.map(cat => cat.id);
        
        const { error: deleteError } = await supabase
            .from('categories')
            .delete()
            .not('id', 'in', `(${categoryIds.map(id => `'${id}'`).join(',')})`);

        if (deleteError && !deleteError.message.includes('No rows found')) {
            console.error('❌ Erro ao deletar categorias antigas:', deleteError);
            throw deleteError;
        }

        const categoriesToUpsert = normalizedCategories.map(category => ({
            id: category.id,
            name: category.name,
            description: category.description
        }));

        const { error: upsertError } = await supabase
            .from('categories')
            .upsert(categoriesToUpsert, { 
                onConflict: 'id'
            });

        if (upsertError) {
            console.error('❌ Erro ao salvar categorias:', upsertError);
            throw upsertError;
        }

        console.log('✅ Categorias salvas com sucesso!');
        res.json({ success: true, message: `${normalizedCategories.length} categorias salvas` });
    } catch (error) {
        console.error("❌ Erro ao salvar categorias:", error);
        res.status(500).json({ error: "Erro ao salvar categorias: " + error.message });
    }
});

// Inicializar servidor
console.log('✅ Backend Bar do Vaqueiro carregado com sucesso!');
console.log('🔧 Inicializando credenciais admin...');

// Garantir credenciais admin ao iniciar
ensureAdminCredentials().then(success => {
    if (success) {
        console.log('✅ Sistema pronto para uso!');
    } else {
        console.log('⚠️ Sistema carregado, mas credenciais admin podem precisar de atenção');
    }
});

export default app;