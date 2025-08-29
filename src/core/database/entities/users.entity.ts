import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class Test {
    @PrimaryGeneratedColumn('uuid')
    id: string;
    @Column({ type: "string", nullable: false })
    email: string;
    @Column({ type: "string", nullable: true })
    name: string;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
