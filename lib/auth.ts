import GoogleProvider from 'next-auth/providers/google'
import { supabaseAdmin } from '@/lib/supabase'
import type { NextAuthOptions } from 'next-auth'

const ALLOWED_DOMAINS = ['xprts.com', 'baylegal.com']

// Maps alternate emails to a canonical work_email in the employees table
const EMAIL_ALIASES: Record<string, string> = {
  'geromemontealegre@baylegal.com': 'geromemontealegre@xprts.com',
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        const email = user.email ?? ''
        const domain = email.split('@')[1] ?? ''
        if (!ALLOWED_DOMAINS.includes(domain)) return false

        const lookupEmail = EMAIL_ALIASES[email] ?? email

        const { data: employee } = await supabaseAdmin
          .from('employees')
          .select('id, name, role, status')
          .eq('work_email', lookupEmail)
          .single()

        if (!employee || employee.status !== 'active') return '/login?error=not_registered'

        ;(user as any).dbId = employee.id
        ;(user as any).role = employee.role
      }
      return true
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = account?.provider === 'google' ? (user as any).dbId : user.id
        token.role = (user as any).role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as 'employee' | 'approver' | 'admin'
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
  },
}
