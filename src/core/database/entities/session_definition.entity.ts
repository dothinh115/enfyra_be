import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User_definition } from './user_definition.entity';

@Entity('session_definition')
export class Session_definition {
    @PrimaryGeneratedColumn('uuid')
    id: string;
    @Column({ type: "timestamp", nullable: false, default: () => "now()" })
    expiredAt: Date;
    @Column({ type: "boolean", nullable: true, default: false })
    remember: boolean;
    @Index()
    @ManyToOne('User_definition', { nullable: false, onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
    @JoinColumn()
    user: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
