import { Column, Entity, OneToMany, PrimaryGeneratedColumn, ManyToMany, ManyToOne, OneToOne, JoinTable, JoinColumn, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Category } from './category.entity';

import { Role } from './role.entity';

import { Route } from './route.entity';

import { Setting } from './setting.entity';

@Entity("user")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({type:'varchar', nullable: false})
  email: string;

  @Column({type:'varchar', nullable: false})
  password: string;

  @Column({type:'boolean', nullable: false})
  isRootUser: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}