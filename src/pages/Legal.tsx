import { Link, useLocation } from "react-router";
import { GlassPanel } from "@/components/glass";

/**
 * Documentos legais públicos (LGPD).
 *
 * Antes deste arquivo o produto não tinha Política de Privacidade nem Termos de
 * Uso — exigência básica para operar no Brasil e para passar em revisão de
 * lojas/parceiros de pagamento.
 *
 * É um texto base: os dados do controlador (razão social, CNPJ, e-mail de
 * contato) precisam ser preenchidos pelo responsável da barbearia antes de
 * publicar.
 */

const UPDATED_AT = "07/10/2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <GlassPanel className="p-6">
      <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </GlassPanel>
  );
}

function Privacy() {
  return (
    <>
      <Section title="1. Quem trata seus dados">
        <p>
          O Barber OS é operado pela barbearia que utiliza a plataforma (a “Controladora”). A
          plataforma atua como operadora: guarda e processa os dados seguindo as instruções da
          barbearia, conforme a Lei nº 13.709/2018 (LGPD).
        </p>
        <p>
          Contato do responsável pelo tratamento de dados: preencha aqui o e-mail do encarregado
          (DPO) da sua barbearia.
        </p>
      </Section>

      <Section title="2. Quais dados são coletados">
        <p>Dados de cadastro e conta: nome, e-mail e telefone de quem usa o sistema.</p>
        <p>
          Dados operacionais da barbearia: serviços, preços, agenda, atendimentos, vendas,
          comissões, caixa, despesas, estoque e fornecedores.
        </p>
        <p>
          Dados de clientes finais: nome, telefone, e-mail, data de nascimento, histórico de
          atendimentos, pacotes, assinaturas, pontos de fidelidade e observações registradas pela
          equipe.
        </p>
        <p>
          Dados técnicos: registros de auditoria (quem criou, alterou ou excluiu cada registro),
          endereço de acesso e informações do navegador, usados para segurança e suporte.
        </p>
      </Section>

      <Section title="3. Para que os dados são usados">
        <p>
          Para operar o sistema (agenda, caixa, estoque, relatórios), para se comunicar com o
          cliente sobre horários e cobranças, para cumprir obrigações legais e fiscais e para
          prevenir fraudes e uso indevido.
        </p>
        <p>
          Base legal: execução de contrato, cumprimento de obrigação legal, legítimo interesse na
          segurança do serviço e, quando exigido, consentimento do titular.
        </p>
      </Section>

      <Section title="4. Compartilhamento">
        <p>
          Não vendemos dados pessoais. Os dados podem ser processados por provedores de
          infraestrutura (hospedagem de banco de dados e de aplicação) e por serviços escolhidos
          pela barbearia, como envio de e-mail, mensagens e meios de pagamento. Cada fornecedor
          recebe apenas o necessário para a função contratada.
        </p>
      </Section>

      <Section title="5. Retenção e exclusão">
        <p>
          Os dados ficam armazenados pelo tempo necessário à operação e ao cumprimento de
          obrigações legais. Registros financeiros e fiscais podem precisar ser mantidos por prazo
          legal mesmo após o encerramento da conta.
        </p>
        <p>
          O titular pode solicitar acesso, correção, portabilidade ou exclusão dos seus dados
          diretamente à barbearia. A barbearia pode usar a exportação de dados da organização e a
          exclusão de cadastros para atender esses pedidos.
        </p>
      </Section>

      <Section title="6. Segurança">
        <p>
          O acesso exige autenticação, cada barbearia é isolada das demais e ações relevantes ficam
          registradas em log de auditoria. Senhas e códigos de acesso nunca são armazenados em
          texto puro. Recomendamos que cada pessoa use a própria conta, com o papel mínimo
          necessário.
        </p>
      </Section>

      <Section title="7. Direitos do titular">
        <p>
          O titular pode pedir confirmação de tratamento, acesso, correção, anonimização,
          bloqueio, eliminação, portabilidade e informação sobre compartilhamentos, além de revogar
          consentimentos. Os pedidos devem ser feitos à barbearia controladora.
        </p>
      </Section>

      <Section title="8. Cookies">
        <p>
          Usamos apenas armazenamento local necessário para manter a sessão autenticada e as
          preferências de interface. Não usamos cookies de publicidade.
        </p>
      </Section>
    </>
  );
}

function Terms() {
  return (
    <>
      <Section title="1. Objeto">
        <p>
          Estes Termos regulam o uso do Barber OS, sistema de gestão para barbearias
          (agenda, atendimentos, vendas, caixa, estoque, fidelidade, assinaturas e relatórios).
        </p>
      </Section>

      <Section title="2. Conta e acesso">
        <p>
          O acesso é pessoal e intransferível. Cada usuário deve usar a própria conta e manter o
          código de acesso em sigilo. O responsável pela barbearia administra os convites e os
          papéis da equipe.
        </p>
        <p>
          Contas de demonstração criam dados fictícios para avaliação do produto e podem ser
          encerradas ou reiniciadas pela plataforma.
        </p>
      </Section>

      <Section title="3. Uso correto">
        <p>
          É proibido usar o sistema para atividades ilícitas, inserir dados de terceiros sem base
          legal, tentar acessar organizações das quais o usuário não é membro, sobrecarregar o
          serviço ou contornar limites técnicos.
        </p>
      </Section>

      <Section title="4. Responsabilidades da barbearia">
        <p>
          A barbearia é responsável pelos dados que insere, pelos preços e informações divulgadas
          aos clientes finais e pelo cumprimento das obrigações trabalhistas, fiscais e de
          proteção de dados aplicáveis à sua operação.
        </p>
      </Section>

      <Section title="5. Disponibilidade e suporte">
        <p>
          O serviço é fornecido em regime de melhor esforço, com janelas de manutenção e
          indisponibilidades pontuais de provedores de infraestrutura. Recomendamos exportar seus
          dados periodicamente.
        </p>
      </Section>

      <Section title="6. Encerramento">
        <p>
          A conta pode ser encerrada a qualquer momento pela barbearia. A plataforma pode
          suspender o acesso em caso de uso indevido, fraude ou violação destes Termos.
        </p>
      </Section>

      <Section title="7. Foro">
        <p>
          Aplica-se a legislação brasileira. Antes de qualquer medida judicial, as partes se
          comprometem a tentar solução amigável.
        </p>
      </Section>
    </>
  );
}

export default function Legal() {
  const { pathname } = useLocation();
  const isPrivacy = pathname.startsWith("/privacidade");

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-12 sm:py-16">
        <header className="space-y-3">
          <Link
            to="/"
            className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
          >
            ← Voltar ao site
          </Link>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/70">
            Barber OS
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {isPrivacy ? "Política de Privacidade" : "Termos de Uso"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Última atualização: {UPDATED_AT}
          </p>
        </header>

        <div className="flex flex-wrap gap-4 text-xs font-medium">
          <Link
            to="/privacidade"
            className={
              isPrivacy
                ? "text-foreground underline underline-offset-4"
                : "text-muted-foreground hover:text-foreground"
            }
          >
            Política de Privacidade
          </Link>
          <Link
            to="/termos"
            className={
              !isPrivacy
                ? "text-foreground underline underline-offset-4"
                : "text-muted-foreground hover:text-foreground"
            }
          >
            Termos de Uso
          </Link>
        </div>

        {isPrivacy ? <Privacy /> : <Terms />}

        <footer className="pb-4 text-xs text-muted-foreground">
          Dúvidas sobre estes documentos? Fale com a barbearia responsável pelo seu atendimento.
        </footer>
      </div>
    </div>
  );
}
