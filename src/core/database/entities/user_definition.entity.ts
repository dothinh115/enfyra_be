import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { HiddenField } from '../../../shared/decorators/hidden-field.decorator';
import { Role_definition } from './role_definition.entity';

@Entity('user_definition')
export class User_definition {
    @PrimaryGeneratedColumn('uuid')
    id: string;
    @Column({ type: "varchar", nullable: false, unique: true })
    email: string;
    @Column({ type: "boolean", nullable: false, default: false, update: false })
    isRootAdmin: boolean;
    @Column({ type: "boolean", nullable: false, default: false })
    isSystem: boolean;
    @Column({ type: "varchar", nullable: false })
    @HiddenField()
    password: string;
    @Index()
    @ManyToOne('Role_definition', { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    role: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
