# Categorias personalizadas no catálogo do Barber OS

Cada barbearia pode criar suas próprias categorias de produtos (ex.: Bonés, Bebidas, Roupas, Acessórios), que são guardadas em `organizations.settings.productCategories`. Não é necessária migração de esquema.

## Interface
- `Produtos e estoque` → **Nova categoria** permite criar antes do produto.
- `Novo produto` / `Editar produto` → **Criar categoria** permite cadastrar e selecionar imediatamente.
- O filtro na listagem inclui categorias configuradas e categorias de produtos legados.
- Produtos cadastrados continuam funcionando no PDV, com preço, estoque e baixa normal.

## Regras de segurança
- Requer permissão de gestão de produtos (`requireManage(..., "products")`).
- Nome de 2 a 60 caracteres, normalizado; até 40 categorias por barbearia.
- Rejeita duplicações sem diferenciar maiúsculas/minúsculas e verifica categorias de produtos existentes.
- Atualização atômica somente da organização autenticada; não mistura catálogos de diferentes barbearias.
- Dados já existentes não são modificados.

A integração com meios de pagamento e o lançamento comercial permanecem congelados. Para bebidas alcoólicas ou produtos sujeitos a regulação, as obrigações de venda continuam sendo responsabilidade do estabelecimento; este recurso é apenas uma classificação de estoque.
