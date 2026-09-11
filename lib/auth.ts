import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { supabaseAdmin } from '@/lib/supabase'
import type { NextAuthOptions } from 'next-auth'

const ALLOWED_DOMAINS = ['xprts.com', 'baylegal.com']

const useGoogle = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

export const authOptions: NextAuthOptions = {
  providers: [
    ...(useGoogle
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
    CredentialsProvider({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const { data: employee, error } = await supabaseAdmin
          .from('employees')
          .select('id, name, work_email, role, status')
          .eq('work_email', credentials.email)
          .single()

        if (error || !employee || employee.status !== 'active') return null

        return {
          id: employee.id,
          name: employee.name,
          email: employee.work_email,
          role: employee.role,
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        const email = user.email ?? ''
        const domain = email.split('@')[1] ?? ''
        if (!ALLOWED_DOMAINS.includes(domain)) return false

        const { data: employee } = await supabaseAdmin
          .from('employees')
          .select('id, name, role, status')
          .eq('work_email', email)
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
