import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components"

/**
 * Transactional email templates built with React Email, which compiles to
 * table-based, inline-styled HTML that renders in Gmail, Outlook and Apple Mail.
 */

export interface AnswerRow {
  label: string
  value: string
}

const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

const s = {
  body: { backgroundColor: "#f6f4ef", margin: 0, padding: "32px 0", fontFamily: font },
  container: { backgroundColor: "#ffffff", border: "1px solid #e7e3da", borderRadius: "8px", maxWidth: "560px", margin: "0 auto", overflow: "hidden" },
  bar: (accent: string) => ({ height: "4px", backgroundColor: accent }),
  inner: { padding: "32px 36px 28px" },
  eyebrow: { margin: 0, fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#7a7468" },
  heading: { margin: "10px 0 0", fontSize: "24px", lineHeight: "30px", fontWeight: 600, color: "#1c2333" },
  text: { margin: "14px 0 0", fontSize: "15px", lineHeight: "24px", color: "#333a48" },
  label: { margin: 0, fontSize: "12px", lineHeight: "18px", color: "#7a7468", verticalAlign: "top" as const, paddingRight: "16px", width: "38%" },
  value: { margin: 0, fontSize: "14px", lineHeight: "20px", color: "#1c2333", whiteSpace: "pre-wrap" as const },
  hr: { borderColor: "#ece8df", margin: "26px 0 18px" },
  footer: { margin: 0, fontSize: "12px", lineHeight: "18px", color: "#8b8577" },
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <Text key={i} style={s.text}>
            {p.split("\n").map((line, j, arr) => (
              <span key={j}>
                {line}
                {j < arr.length - 1 && <br />}
              </span>
            ))}
          </Text>
        ))}
    </>
  )
}

function Answers({ answers, title }: { answers: AnswerRow[]; title: string }) {
  if (answers.length === 0) return null
  return (
    <Section>
      <Hr style={s.hr} />
      <Text style={{ ...s.eyebrow, marginBottom: "12px" }}>{title}</Text>
      {answers.map((a, i) => (
        <Row key={i} style={{ marginBottom: "10px" }}>
          <Column style={s.label}>{a.label}</Column>
          <Column>
            <Text style={s.value}>{a.value || "—"}</Text>
          </Column>
        </Row>
      ))}
    </Section>
  )
}

export function ThankYouEmail({
  formTitle,
  heading,
  body,
  answers,
  accent = "#1d4ed8",
  receiptUrl,
  brand = "Digital Fueled",
  canReply = true,
}: {
  formTitle: string
  heading: string
  body: string
  answers: AnswerRow[]
  accent?: string
  receiptUrl?: string | null
  brand?: string
  /** Whether a Reply-To address is set, so replies reach the form owner */
  canReply?: boolean
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{heading}</Preview>
      <Body style={s.body}>
        <Container style={s.container}>
          <Section style={s.bar(accent)} />
          <Section style={s.inner}>
            <Text style={s.eyebrow}>{formTitle}</Text>
            <Heading as="h1" style={s.heading}>
              {heading}
            </Heading>
            <Paragraphs text={body} />
            <Answers answers={answers} title="A copy of your answers" />
            <Hr style={s.hr} />
            <Text style={s.footer}>
              {receiptUrl ? (
                <>
                  <Link href={receiptUrl} style={{ color: accent }}>
                    View or print your receipt
                  </Link>
                  {" · "}
                </>
              ) : null}
              Sent by {brand} on behalf of the form owner.{canReply ? " Reply to this email to reach them." : ""}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export function NewResponseEmail({
  formTitle,
  answers,
  dashboardUrl,
  accent = "#1d4ed8",
}: {
  formTitle: string
  answers: AnswerRow[]
  dashboardUrl: string
  accent?: string
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{`New response to ${formTitle}`}</Preview>
      <Body style={s.body}>
        <Container style={s.container}>
          <Section style={s.bar(accent)} />
          <Section style={s.inner}>
            <Text style={s.eyebrow}>New response</Text>
            <Heading as="h1" style={s.heading}>
              {formTitle}
            </Heading>
            <Answers answers={answers} title="Answers" />
            <Hr style={s.hr} />
            <Text style={s.footer}>
              <Link href={dashboardUrl} style={{ color: accent }}>
                Open in Digital Fueled
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
